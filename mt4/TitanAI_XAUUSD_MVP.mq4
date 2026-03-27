#property strict

input string ApiBaseUrl = "https://titan-ai-api.onrender.com";
input string ApiKey = "change-me";
input int PollSeconds = 30;
input int SlippagePoints = 30;
input int MaxSpreadPoints = 45;
input int MagicNumber = 260326;
input double FixedLot = 0.01;
input bool TradeOnlyM5Close = true;
input int CandlesToSend = 120;
input bool BootstrapHistoryFirst = true;
input int BootstrapYears = 10;
input int BootstrapChunkCandles = 350;
input int LiveHistoryUpdateMinutes = 15;
input bool BootstrapIncludeH1H4 = true;

datetime g_lastBarTime = 0;
bool g_bootstrapInited = false;
bool g_bootstrapDone = false;
int g_bootstrapStage = 0; // 0=D1,1=H4,2=H1,3=done
int g_bootstrapShiftD1 = 0;
int g_bootstrapShiftH4 = 0;
int g_bootstrapShiftH1 = 0;
datetime g_lastHistoryPushAt = 0;

string JsonEscape(string s) {
   string out = s;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\r", "");
   StringReplace(out, "\n", "\\n");
   return out;
}

string NumToStr(double v, int digits = 8) {
   return DoubleToString(v, digits);
}

string Upper(string s) {
   string t = s;
   StringToUpper(t);
   return t;
}

string GetApiBaseUrl() {
   string u = ApiBaseUrl;
   // Clean common copy/paste issues from MT4 inputs.
   StringReplace(u, " ", "");
   StringReplace(u, "\t", "");
   StringReplace(u, "https//", "https://");
   StringReplace(u, "http//", "http://");
   StringReplace(u, "：", ":");
   StringReplace(u, "／", "/");
   if(StringFind(u, "your-domain.com", 0) >= 0 || StringLen(u) < 8) {
      u = "https://titan-ai-api.onrender.com";
   }
   if(StringFind(u, "http://", 0) != 0 && StringFind(u, "https://", 0) != 0) {
      u = "https://" + u;
   }
   while(StringLen(u) > 0 && StringSubstr(u, StringLen(u) - 1, 1) == "/") {
      u = StringSubstr(u, 0, StringLen(u) - 1);
   }
   return u;
}

string TfLabelByPeriod(int period) {
   if(period == PERIOD_M1) return "M1";
   if(period == PERIOD_M5) return "M5";
   if(period == PERIOD_M15) return "M15";
   if(period == PERIOD_M30) return "M30";
   if(period == PERIOD_H1) return "H1";
   if(period == PERIOD_H4) return "H4";
   if(period == PERIOD_D1) return "D1";
   return "M5";
}

bool IsNewBar() {
   datetime t = iTime(Symbol(), PERIOD_M5, 0);
   if(t <= 0) return false;
   if(g_lastBarTime == 0) {
      g_lastBarTime = t;
      return true;
   }
   if(t != g_lastBarTime) {
      g_lastBarTime = t;
      return true;
   }
   return false;
}

double CurrentSpreadPoints() {
   return (Ask - Bid) / Point;
}

bool IsTradeSymbolAllowed() {
   string s = Upper(Symbol());
   return (s == "XAUUSD" || StringFind(s, "GOLD", 0) >= 0);
}

int CountMyOpenOrders(int type = -1) {
   int cnt = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--) {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != Symbol()) continue;
      if(OrderMagicNumber() != MagicNumber) continue;
      if(type >= 0 && OrderType() != type) continue;
      if(OrderType() == OP_BUY || OrderType() == OP_SELL) cnt++;
   }
   return cnt;
}

bool CloseAllMyPositions(string reason) {
   bool okAll = true;
   for(int i = OrdersTotal() - 1; i >= 0; i--) {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != Symbol()) continue;
      if(OrderMagicNumber() != MagicNumber) continue;
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL) continue;
      double lots = OrderLots();
      int ticket = OrderTicket();
      bool ok = false;
      if(type == OP_BUY) ok = OrderClose(ticket, lots, Bid, SlippagePoints, clrTomato);
      if(type == OP_SELL) ok = OrderClose(ticket, lots, Ask, SlippagePoints, clrTomato);
      if(!ok) {
         Print("TitanAI close failed ticket=", ticket, " err=", GetLastError(), " reason=", reason);
         okAll = false;
      } else {
         SendExecution("CLOSE", lots, (type == OP_BUY ? Bid : Ask), 0.0, ticket, reason);
      }
   }
   return okAll;
}

string BuildOpenPositionsJson() {
   string arr = "[";
   bool first = true;
   for(int i = OrdersTotal() - 1; i >= 0; i--) {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != Symbol()) continue;
      if(OrderMagicNumber() != MagicNumber) continue;
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL) continue;
      if(!first) arr += ",";
      first = false;
      string side = (type == OP_BUY ? "BUY" : "SELL");
      arr += "{";
      arr += "\"ticket\":" + IntegerToString(OrderTicket()) + ",";
      arr += "\"side\":\"" + side + "\",";
      arr += "\"lots\":" + NumToStr(OrderLots(), 2) + ",";
      arr += "\"entry\":" + NumToStr(OrderOpenPrice(), Digits) + ",";
      arr += "\"sl\":" + NumToStr(OrderStopLoss(), Digits) + ",";
      arr += "\"tp\":" + NumToStr(OrderTakeProfit(), Digits) + ",";
      arr += "\"profit\":" + NumToStr(OrderProfit() + OrderSwap() + OrderCommission(), 2);
      arr += "}";
   }
   arr += "]";
   return arr;
}

string BuildCandlesJson(int count) {
   int bars = iBars(Symbol(), PERIOD_M5);
   int n = MathMin(MathMax(20, count), bars - 2);
   string arr = "[";
   bool first = true;
   for(int i = n; i >= 1; i--) {
      datetime t = iTime(Symbol(), PERIOD_M5, i);
      double o = iOpen(Symbol(), PERIOD_M5, i);
      double h = iHigh(Symbol(), PERIOD_M5, i);
      double l = iLow(Symbol(), PERIOD_M5, i);
      double c = iClose(Symbol(), PERIOD_M5, i);
      if(!first) arr += ",";
      first = false;
      arr += "{";
      arr += "\"time\":\"" + TimeToString(t, TIME_DATE|TIME_MINUTES) + "\",";
      arr += "\"open\":" + NumToStr(o, Digits) + ",";
      arr += "\"high\":" + NumToStr(h, Digits) + ",";
      arr += "\"low\":" + NumToStr(l, Digits) + ",";
      arr += "\"close\":" + NumToStr(c, Digits);
      arr += "}";
   }
   arr += "]";
   return arr;
}

string BuildCandlesJsonByPeriodRange(int period, int startShift, int count) {
   int bars = iBars(Symbol(), period);
   if(bars < 5) return "[]";
   int s = MathMin(startShift, bars - 2);
   int e = MathMax(1, s - count + 1);
   string arr = "[";
   bool first = true;
   for(int i = s; i >= e; i--) {
      datetime t = iTime(Symbol(), period, i);
      double o = iOpen(Symbol(), period, i);
      double h = iHigh(Symbol(), period, i);
      double l = iLow(Symbol(), period, i);
      double c = iClose(Symbol(), period, i);
      double v = iVolume(Symbol(), period, i);
      if(!first) arr += ",";
      first = false;
      arr += "{";
      arr += "\"time\":\"" + TimeToString(t, TIME_DATE|TIME_MINUTES) + "\",";
      arr += "\"open\":" + NumToStr(o, Digits) + ",";
      arr += "\"high\":" + NumToStr(h, Digits) + ",";
      arr += "\"low\":" + NumToStr(l, Digits) + ",";
      arr += "\"close\":" + NumToStr(c, Digits) + ",";
      arr += "\"volume\":" + NumToStr(v, 0);
      arr += "}";
   }
   arr += "]";
   return arr;
}

string BuildSignalPayload() {
   string payload = "{";
   payload += "\"apiKey\":\"" + JsonEscape(ApiKey) + "\",";
   payload += "\"accountId\":\"" + IntegerToString(AccountNumber()) + "\",";
   payload += "\"symbol\":\"XAUUSD\",";
   payload += "\"timeframe\":\"M5\",";
   payload += "\"brokerTime\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\",";
   payload += "\"bid\":" + NumToStr(Bid, Digits) + ",";
   payload += "\"ask\":" + NumToStr(Ask, Digits) + ",";
   payload += "\"spreadPoints\":" + NumToStr(CurrentSpreadPoints(), 2) + ",";
   payload += "\"equity\":" + NumToStr(AccountEquity(), 2) + ",";
   payload += "\"freeMargin\":" + NumToStr(AccountFreeMargin(), 2) + ",";
   payload += "\"openPositions\":" + BuildOpenPositionsJson() + ",";
   payload += "\"candles\":" + BuildCandlesJson(CandlesToSend);
   payload += "}";
   return payload;
}

bool HttpPostJson(string endpoint, string body, string &responseOut) {
   string url = GetApiBaseUrl() + endpoint;
   char postData[];
   int bodyLen = StringLen(body);
   StringToCharArray(body, postData, 0, bodyLen, CP_UTF8);
   char result[];
   string headers = "Content-Type: application/json\r\nAccept: application/json\r\nX-MT4-Key: " + ApiKey + "\r\n";
   string resultHeaders = "";
   int timeout = 6000;
   int code = WebRequest("POST", url, headers, timeout, postData, result, resultHeaders);
   if(code == -1) {
      Print("TitanAI WebRequest error: ", GetLastError(), " url=", url);
      return false;
   }
   responseOut = CharArrayToString(result, 0, -1, CP_UTF8);
   if(code < 200 || code >= 300) {
      Print("TitanAI HTTP status=", code, " body=", responseOut);
      return false;
   }
   return true;
}

string BuildHistoryUploadPayload(string mode, int period, int startShift, int count, bool doneFlag) {
   string payload = "{";
   payload += "\"apiKey\":\"" + JsonEscape(ApiKey) + "\",";
   payload += "\"accountId\":\"" + IntegerToString(AccountNumber()) + "\",";
   payload += "\"symbol\":\"XAUUSD\",";
   payload += "\"timeframe\":\"" + TfLabelByPeriod(period) + "\",";
   payload += "\"mode\":\"" + JsonEscape(mode) + "\",";
   payload += "\"done\":" + (doneFlag ? "true" : "false") + ",";
   payload += "\"targetRows\":" + IntegerToString(MathMax(365, BootstrapYears * 365)) + ",";
   payload += "\"brokerTime\":\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\",";
   payload += "\"candles\":" + BuildCandlesJsonByPeriodRange(period, startShift, count);
   payload += "}";
   return payload;
}

bool UploadHistoryChunk(string mode, int period, int startShift, int count, bool doneFlag) {
   string body = BuildHistoryUploadPayload(mode, period, startShift, count, doneFlag);
   string rsp = "";
   return HttpPostJson("/api/mt4/gold/history-upload", body, rsp);
}

void InitBootstrapState() {
   int barsD1 = iBars(Symbol(), PERIOD_D1);
   int barsH4 = iBars(Symbol(), PERIOD_H4);
   int barsH1 = iBars(Symbol(), PERIOD_H1);
   int maxRows = MathMax(30, BootstrapYears * 365);
   g_bootstrapShiftD1 = MathMin(barsD1 - 2, maxRows);
   g_bootstrapShiftH4 = MathMin(barsH4 - 2, maxRows * 6);
   g_bootstrapShiftH1 = MathMin(barsH1 - 2, maxRows * 24);
   g_bootstrapStage = 0;
   g_bootstrapInited = true;
   g_bootstrapDone = (g_bootstrapShiftD1 < 1);
   if(g_bootstrapDone) {
      Print("TitanAI bootstrap skipped (not enough D1 bars).");
   } else {
      Print("TitanAI bootstrap start D1 rows=", g_bootstrapShiftD1);
   }
}

void RunBootstrapStep() {
   if(!g_bootstrapInited) InitBootstrapState();
   if(g_bootstrapDone) return;
   int chunk = MathMax(50, MathMin(1200, BootstrapChunkCandles));
   int period = PERIOD_D1;
   int startShift = g_bootstrapShiftD1;
   string mode = "bootstrap_d1";
   if(g_bootstrapStage == 1) {
      period = PERIOD_H4;
      startShift = g_bootstrapShiftH4;
      mode = "bootstrap_h4";
   } else if(g_bootstrapStage == 2) {
      period = PERIOD_H1;
      startShift = g_bootstrapShiftH1;
      mode = "bootstrap_h1";
   }
   if(startShift < 1) {
      if(g_bootstrapStage >= 2 || !BootstrapIncludeH1H4) {
         g_bootstrapDone = true;
         Print("TitanAI bootstrap completed.");
      } else {
         g_bootstrapStage++;
      }
      return;
   }
   int count = MathMin(chunk, startShift);
   int endShift = MathMax(1, startShift - count + 1);
   bool finalChunk = (endShift <= 1 && (g_bootstrapStage >= 2 || !BootstrapIncludeH1H4));
   bool ok = UploadHistoryChunk(mode, period, startShift, count, finalChunk);
   if(!ok) {
      Print("TitanAI bootstrap chunk upload failed period=", TfLabelByPeriod(period), " shift=", startShift);
      return;
   }
   if(g_bootstrapStage == 0) g_bootstrapShiftD1 = endShift - 1;
   if(g_bootstrapStage == 1) g_bootstrapShiftH4 = endShift - 1;
   if(g_bootstrapStage == 2) g_bootstrapShiftH1 = endShift - 1;
   if(endShift <= 1) {
      if(g_bootstrapStage >= 2 || !BootstrapIncludeH1H4) {
         g_bootstrapDone = true;
         Print("TitanAI bootstrap completed.");
      } else {
         g_bootstrapStage++;
         Print("TitanAI bootstrap stage advanced to ", g_bootstrapStage);
      }
   }
}

void PushLiveHistoryIfDue() {
   int mins = MathMax(1, LiveHistoryUpdateMinutes);
   if(g_lastHistoryPushAt > 0 && (TimeCurrent() - g_lastHistoryPushAt) < mins * 60) return;
   bool ok = false;
   int barsM5 = iBars(Symbol(), PERIOD_M5);
   if(barsM5 >= 40) {
      int s5 = MathMin(barsM5 - 2, 320);
      int c5 = MathMin(280, s5);
      if(UploadHistoryChunk("live_append_m5", PERIOD_M5, s5, c5, false)) ok = true;
   }
   int barsH1 = iBars(Symbol(), PERIOD_H1);
   if(barsH1 >= 40) {
      int s1 = MathMin(barsH1 - 2, 260);
      int c1 = MathMin(220, s1);
      if(UploadHistoryChunk("live_append_h1", PERIOD_H1, s1, c1, false)) ok = true;
   }
   int barsH4 = iBars(Symbol(), PERIOD_H4);
   if(barsH4 >= 40) {
      int s4 = MathMin(barsH4 - 2, 260);
      int c4 = MathMin(220, s4);
      if(UploadHistoryChunk("live_append_h4", PERIOD_H4, s4, c4, false)) ok = true;
   }
   if(ok) g_lastHistoryPushAt = TimeCurrent();
}

string JsonGetString(string json, string key) {
   string token = "\"" + key + "\":";
   int p = StringFind(json, token, 0);
   if(p < 0) return "";
   int s = StringFind(json, "\"", p + StringLen(token));
   if(s < 0) return "";
   int e = StringFind(json, "\"", s + 1);
   if(e < 0) return "";
   return StringSubstr(json, s + 1, e - s - 1);
}

double JsonGetNumber(string json, string key, double defv = 0.0) {
   string token = "\"" + key + "\":";
   int p = StringFind(json, token, 0);
   if(p < 0) return defv;
   int s = p + StringLen(token);
   int e = s;
   int len = StringLen(json);
   while(e < len) {
      string ch = StringSubstr(json, e, 1);
      if((ch >= "0" && ch <= "9") || ch == "." || ch == "-" || ch == "+") e++;
      else break;
   }
   if(e <= s) return defv;
   return StrToDouble(StringSubstr(json, s, e - s));
}

bool ParseDecision(string json, string &action, double &sl, double &tp, string &reason) {
   action = JsonGetString(json, "action");
   if(action == "") action = "WAIT";
   sl = JsonGetNumber(json, "sl", 0.0);
   tp = JsonGetNumber(json, "tp", 0.0);
   reason = JsonGetString(json, "reason");
   if(reason == "") reason = "no-reason";
   return true;
}

bool OpenOrder(int type, double lot, double sl, double tp, string reason) {
   if(CurrentSpreadPoints() > MaxSpreadPoints) {
      Print("TitanAI skip open (spread guard): ", CurrentSpreadPoints());
      return false;
   }
   double price = (type == OP_BUY ? Ask : Bid);
   lot = MathMax(MarketInfo(Symbol(), MODE_MINLOT), lot);
   lot = NormalizeDouble(lot, 2);
   sl = (sl > 0 ? NormalizeDouble(sl, Digits) : 0.0);
   tp = (tp > 0 ? NormalizeDouble(tp, Digits) : 0.0);
   int ticket = OrderSend(Symbol(), type, lot, price, SlippagePoints, sl, tp, "TitanAI", MagicNumber, 0, clrDeepSkyBlue);
   if(ticket < 0) {
      Print("TitanAI OrderSend failed err=", GetLastError(), " reason=", reason);
      return false;
   }
   SendExecution((type == OP_BUY ? "BUY" : "SELL"), lot, price, 0.0, ticket, reason);
   return true;
}

void SendExecution(string orderType, double lots, double price, double pnl, int ticket, string comment) {
   string body = "{";
   body += "\"apiKey\":\"" + JsonEscape(ApiKey) + "\",";
   body += "\"accountId\":\"" + IntegerToString(AccountNumber()) + "\",";
   body += "\"symbol\":\"XAUUSD\",";
   body += "\"orderType\":\"" + JsonEscape(orderType) + "\",";
   body += "\"lots\":" + NumToStr(lots, 2) + ",";
   body += "\"price\":" + NumToStr(price, Digits) + ",";
   body += "\"pnl\":" + NumToStr(pnl, 2) + ",";
   body += "\"ticket\":\"" + IntegerToString(ticket) + "\",";
   body += "\"comment\":\"" + JsonEscape(comment) + "\"";
   body += "}";
   string rsp = "";
   HttpPostJson("/api/mt4/gold/execution", body, rsp);
}

void HandleSignal() {
   if(!IsTradeAllowed()) return;
   if(!IsTradeSymbolAllowed()) return;
   if(TradeOnlyM5Close && !IsNewBar()) return;

   string payload = BuildSignalPayload();
   string rsp = "";
   if(!HttpPostJson("/api/mt4/gold/signal", payload, rsp)) return;

   string action, reason;
   double sl, tp;
   ParseDecision(rsp, action, sl, tp, reason);
   action = Upper(action);

   if(action == "WAIT") return;
   if(action == "CLOSE_ALL") {
      CloseAllMyPositions(reason);
      return;
   }
   if(action == "OPEN_BUY") {
      if(CountMyOpenOrders(OP_BUY) > 0) return;
      if(CountMyOpenOrders(OP_SELL) > 0) CloseAllMyPositions("flip-to-buy");
      OpenOrder(OP_BUY, FixedLot, sl, tp, reason);
      return;
   }
   if(action == "OPEN_SELL") {
      if(CountMyOpenOrders(OP_SELL) > 0) return;
      if(CountMyOpenOrders(OP_BUY) > 0) CloseAllMyPositions("flip-to-sell");
      OpenOrder(OP_SELL, FixedLot, sl, tp, reason);
      return;
   }
}

int OnInit() {
   int timerSeconds = PollSeconds;
   if(timerSeconds < 5) timerSeconds = 5;
   EventSetTimer(timerSeconds);
   Print("TitanAI_XAUUSD_MVP initialized. baseUrl=", GetApiBaseUrl(), ". Add API URL to MT4 WebRequest whitelist.");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) {
   EventKillTimer();
}

void OnTick() {
   // Deliberately lightweight. Main cycle uses timer.
}

void OnTimer() {
   if(BootstrapHistoryFirst && !g_bootstrapDone) {
      RunBootstrapStep();
      return;
   }
   PushLiveHistoryIfDue();
   HandleSignal();
}

