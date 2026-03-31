#property strict

// TitanAI XAUUSD BRIDGE (AI-first)
// EA role: send market data -> receive AI decision -> execute.

input string ApiBaseUrl = "https://titan-ai-api.onrender.com";
input string ApiKey = "";
input int PollSeconds = 60;
input int SlippagePoints = 35;
input int MagicNumber = 260326;
input int CandlesToSend = 160;
input bool IncludeM15Candles = true;
input int CandlesM15ToSend = 48;
input double FixedLot = 0.10;
input bool UseAiRiskSizing = true;
input double AiRiskPercentDefault = 0.30;
input double AiRiskPercentMin = 0.10;
input double AiRiskPercentMax = 2.00;
input bool ForceMinLotOverride = true;
input double ForcedMinLot = 0.10;
input bool AllowScaleIn = true;
input int MaxOpenPositionsPerSide = 4;
// Default ON: avoid many entries at nearly the same price (investor-style). Set false to rely on AI only.
input bool EnforceMinSpacingSameSide = true;
input double MinDollarsBetweenSameSideAdds = 8.0;

string JsonEscape(string s) {
   string out = s;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\r", "");
   StringReplace(out, "\n", "\\n");
   return out;
}

string NumToStr(double v, int digits = 8) { return DoubleToString(v, digits); }

string Upper(string s) {
   string t = s;
   StringToUpper(t);
   return t;
}

string GetApiBaseUrl() {
   string u = ApiBaseUrl;
   StringReplace(u, " ", "");
   StringReplace(u, "\t", "");
   StringReplace(u, "https//", "https://");
   StringReplace(u, "http//", "http://");
   while(StringLen(u) > 0 && StringSubstr(u, StringLen(u) - 1, 1) == "/") {
      u = StringSubstr(u, 0, StringLen(u) - 1);
   }
   return u;
}

double CurrentSpreadPoints() { return (Ask - Bid) / Point; }

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
      int ot = OrderType();
      if(ot != OP_BUY && ot != OP_SELL) continue;
      if(type >= 0 && ot != type) continue;
      cnt++;
   }
   return cnt;
}

double WeightedAvgEntry(int type) {
   double sum = 0.0;
   double lots = 0.0;
   for(int i = OrdersTotal() - 1; i >= 0; i--) {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != Symbol()) continue;
      if(OrderMagicNumber() != MagicNumber) continue;
      if(OrderType() != type) continue;
      double l = OrderLots();
      sum += OrderOpenPrice() * l;
      lots += l;
   }
   if(lots <= 0) return 0.0;
   return sum / lots;
}

bool TooCloseSameSide(int type, double minDollars) {
   if(CountMyOpenOrders(type) <= 0) return false;
   if(minDollars <= 0) return false;
   double avg = WeightedAvgEntry(type);
   if(avg <= 0) return false;
   double px = (type == OP_BUY ? Ask : Bid);
   return (MathAbs(px - avg) < minDollars);
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
   string url = GetApiBaseUrl() + "/api/mt4/gold/execution";
   char postData[];
   int bodyLen = StringLen(body);
   StringToCharArray(body, postData, 0, bodyLen, CP_UTF8);
   char result[];
   string headers = "Content-Type: application/json\r\nAccept: application/json\r\nX-MT4-Key: " + ApiKey + "\r\n";
   string resultHeaders = "";
   WebRequest("POST", url, headers, 6000, postData, result, resultHeaders);
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
      bool ok = (type == OP_BUY)
         ? OrderClose(ticket, lots, Bid, SlippagePoints, clrTomato)
         : OrderClose(ticket, lots, Ask, SlippagePoints, clrTomato);
      if(!ok) {
         okAll = false;
         Print("Bridge close failed ticket=", ticket, " err=", GetLastError(), " reason=", reason);
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
      arr += "{";
      arr += "\"ticket\":" + IntegerToString(OrderTicket()) + ",";
      arr += "\"side\":\"" + (type == OP_BUY ? "BUY" : "SELL") + "\",";
      arr += "\"lots\":" + NumToStr(OrderLots(), 2) + ",";
      arr += "\"entry\":" + NumToStr(OrderOpenPrice(), Digits) + ",";
      arr += "\"sl\":" + NumToStr(OrderStopLoss(), Digits) + ",";
      arr += "\"tp\":" + NumToStr(OrderTakeProfit(), Digits) + ",";
      arr += "\"profit\":" + NumToStr(OrderProfit() + OrderSwap() + OrderCommission(), 2) + ",";
      arr += "\"minutesOpen\":" + IntegerToString((int)((TimeCurrent() - OrderOpenTime()) / 60));
      arr += "}";
   }
   arr += "]";
   return arr;
}

string BuildCandlesJson(int count) {
   int bars = iBars(Symbol(), PERIOD_M5);
   int n = MathMin(MathMax(30, count), bars - 2);
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

string BuildCandlesM15Json(int count) {
   int bars = iBars(Symbol(), PERIOD_M15);
   int n = MathMin(MathMax(20, count), bars - 2);
   string arr = "[";
   bool first = true;
   for(int i = n; i >= 1; i--) {
      datetime t = iTime(Symbol(), PERIOD_M15, i);
      double o = iOpen(Symbol(), PERIOD_M15, i);
      double h = iHigh(Symbol(), PERIOD_M15, i);
      double l = iLow(Symbol(), PERIOD_M15, i);
      double c = iClose(Symbol(), PERIOD_M15, i);
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
   if(IncludeM15Candles) {
      payload += ",\"candlesM15\":" + BuildCandlesM15Json(CandlesM15ToSend);
   }
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
   int code = WebRequest("POST", url, headers, 7000, postData, result, resultHeaders);
   if(code == -1) {
      Print("Bridge WebRequest error=", GetLastError(), " url=", url);
      return false;
   }
   responseOut = CharArrayToString(result, 0, -1, CP_UTF8);
   if(code < 200 || code >= 300) {
      Print("Bridge HTTP status=", code, " body=", responseOut);
      return false;
   }
   return true;
}

int JsonFindKey(string json, string key) {
   return StringFind(json, "\"" + key + "\"", 0);
}

string JsonGetString(string json, string key) {
   int p = JsonFindKey(json, key);
   if(p < 0) return "";
   int c = StringFind(json, ":", p);
   if(c < 0) return "";
   int q1 = StringFind(json, "\"", c + 1);
   if(q1 < 0) return "";
   int q2 = StringFind(json, "\"", q1 + 1);
   if(q2 < 0) return "";
   return StringSubstr(json, q1 + 1, q2 - q1 - 1);
}

double JsonGetNumber(string json, string key, double defVal = 0.0) {
   int p = JsonFindKey(json, key);
   if(p < 0) return defVal;
   int c = StringFind(json, ":", p);
   if(c < 0) return defVal;
   int i = c + 1;
   while(i < StringLen(json)) {
      string ch = StringSubstr(json, i, 1);
      if(ch != " " && ch != "\t" && ch != "\r" && ch != "\n") break;
      i++;
   }
   int j = i;
   while(j < StringLen(json)) {
      string ch2 = StringSubstr(json, j, 1);
      bool okChar = (ch2 == "-" || ch2 == "+" || ch2 == "." || (ch2 >= "0" && ch2 <= "9") || ch2 == "e" || ch2 == "E");
      if(!okChar) break;
      j++;
   }
   if(j <= i) return defVal;
   string raw = StringSubstr(json, i, j - i);
   return StrToDouble(raw);
}

bool ParseDecision(string json, string &action, double &sl, double &tp, string &reason, double &riskPercent) {
   action = JsonGetString(json, "action");
   sl = JsonGetNumber(json, "sl", 0.0);
   tp = JsonGetNumber(json, "tp", 0.0);
   reason = JsonGetString(json, "reason");
   riskPercent = JsonGetNumber(json, "riskPercent", -1.0);
   if(action == "") {
      int dpos = StringFind(json, "\"decision\"", 0);
      if(dpos >= 0) {
         string tail = StringSubstr(json, dpos);
         action = JsonGetString(tail, "action");
         if(sl <= 0) sl = JsonGetNumber(tail, "sl", 0.0);
         if(tp <= 0) tp = JsonGetNumber(tail, "tp", 0.0);
         if(reason == "") reason = JsonGetString(tail, "reason");
         if(riskPercent <= 0) riskPercent = JsonGetNumber(tail, "riskPercent", -1.0);
      }
   }
   if(action == "") action = "WAIT";
   if(reason == "") reason = "no-reason";
   return true;
}

double ClampLotToBroker(double lotRaw) {
   double minLot = MarketInfo(Symbol(), MODE_MINLOT);
   if(ForceMinLotOverride && ForcedMinLot > 0) minLot = MathMax(minLot, ForcedMinLot);
   double maxLot = MarketInfo(Symbol(), MODE_MAXLOT);
   double step = MarketInfo(Symbol(), MODE_LOTSTEP);
   if(step <= 0) step = 0.01;
   double lot = MathMax(minLot, MathMin(maxLot, lotRaw));
   lot = MathFloor(lot / step) * step;
   lot = NormalizeDouble(lot, 2);
   if(lot < minLot) lot = minLot;
   if(lot > maxLot) lot = maxLot;
   return lot;
}

double ComputeLotByRiskPercent(int type, double sl, double fallbackLot, double riskPercent) {
   if(!UseAiRiskSizing) return ClampLotToBroker(fallbackLot);
   if(riskPercent <= 0) riskPercent = AiRiskPercentDefault;
   riskPercent = MathMax(AiRiskPercentMin, MathMin(AiRiskPercentMax, riskPercent));
   double entry = (type == OP_BUY ? Ask : Bid);
   if(entry <= 0 || sl <= 0) return ClampLotToBroker(fallbackLot);
   double slDist = MathAbs(entry - sl);
   if(slDist <= (Point * 5.0)) return ClampLotToBroker(fallbackLot);
   double tickValue = MarketInfo(Symbol(), MODE_TICKVALUE);
   double tickSize = MarketInfo(Symbol(), MODE_TICKSIZE);
   if(tickValue <= 0 || tickSize <= 0) return ClampLotToBroker(fallbackLot);
   double moneyPerPricePerLot = tickValue / tickSize;
   if(moneyPerPricePerLot <= 0) return ClampLotToBroker(fallbackLot);
   double riskMoney = AccountEquity() * (riskPercent / 100.0);
   if(riskMoney <= 0) return ClampLotToBroker(fallbackLot);
   double lot = riskMoney / (slDist * moneyPerPricePerLot);
   return ClampLotToBroker(lot);
}

bool OpenOrder(int type, double lot, double sl, double tp, string reason) {
   RefreshRates();
   double price = (type == OP_BUY ? Ask : Bid);
   lot = ClampLotToBroker(lot);
   sl = (sl > 0 ? NormalizeDouble(sl, Digits) : 0.0);
   tp = (tp > 0 ? NormalizeDouble(tp, Digits) : 0.0);
   int ticket = OrderSend(Symbol(), type, lot, price, SlippagePoints, sl, tp, "TitanAI_BRIDGE", MagicNumber, 0, clrDeepSkyBlue);
   if(ticket < 0) {
      Print("Bridge OrderSend failed err=", GetLastError(), " reason=", reason);
      return false;
   }
   SendExecution((type == OP_BUY ? "BUY" : "SELL"), lot, price, 0.0, ticket, reason);
   return true;
}

void HandleSignal() {
   if(!IsTradeAllowed()) return;
   if(!IsTradeSymbolAllowed()) return;
   string payload = BuildSignalPayload();
   string rsp = "";
   if(!HttpPostJson("/api/mt4/gold/signal", payload, rsp)) return;

   string action, reason;
   double sl, tp, riskPercent;
   ParseDecision(rsp, action, sl, tp, reason, riskPercent);
   action = Upper(action);

   if(action == "WAIT") return;
   if(action == "CLOSE_ALL") { CloseAllMyPositions(reason); return; }

   if(action == "SCALE_IN_BUY") {
      if(!AllowScaleIn) return;
      if(CountMyOpenOrders(OP_BUY) >= MaxOpenPositionsPerSide) return;
      if(EnforceMinSpacingSameSide && CountMyOpenOrders(OP_BUY) > 0 && TooCloseSameSide(OP_BUY, MinDollarsBetweenSameSideAdds)) {
         Print("Bridge skip SCALE_IN_BUY: too close to avg entry (< ", MinDollarsBetweenSameSideAdds, " )");
         return;
      }
      double lotSb = ComputeLotByRiskPercent(OP_BUY, sl, FixedLot, riskPercent);
      OpenOrder(OP_BUY, lotSb, sl, tp, reason);
      return;
   }
   if(action == "SCALE_IN_SELL") {
      if(!AllowScaleIn) return;
      if(CountMyOpenOrders(OP_SELL) >= MaxOpenPositionsPerSide) return;
      if(EnforceMinSpacingSameSide && CountMyOpenOrders(OP_SELL) > 0 && TooCloseSameSide(OP_SELL, MinDollarsBetweenSameSideAdds)) {
         Print("Bridge skip SCALE_IN_SELL: too close to avg entry (< ", MinDollarsBetweenSameSideAdds, " )");
         return;
      }
      double lotSs = ComputeLotByRiskPercent(OP_SELL, sl, FixedLot, riskPercent);
      OpenOrder(OP_SELL, lotSs, sl, tp, reason);
      return;
   }
   if(action == "OPEN_BUY") {
      if(CountMyOpenOrders(OP_BUY) > 0) {
         if(!AllowScaleIn) return;
         if(EnforceMinSpacingSameSide && TooCloseSameSide(OP_BUY, MinDollarsBetweenSameSideAdds)) {
            Print("Bridge skip OPEN_BUY (already longs): too close to avg entry — use SCALE_IN_BUY after price moves or CLOSE_ALL");
            return;
         }
         if(CountMyOpenOrders(OP_BUY) >= MaxOpenPositionsPerSide) return;
      }
      double lotOb = ComputeLotByRiskPercent(OP_BUY, sl, FixedLot, riskPercent);
      OpenOrder(OP_BUY, lotOb, sl, tp, reason);
      return;
   }
   if(action == "OPEN_SELL") {
      if(CountMyOpenOrders(OP_SELL) > 0) {
         if(!AllowScaleIn) return;
         if(EnforceMinSpacingSameSide && TooCloseSameSide(OP_SELL, MinDollarsBetweenSameSideAdds)) {
            Print("Bridge skip OPEN_SELL (already shorts): too close to avg entry — use SCALE_IN_SELL after price moves or CLOSE_ALL");
            return;
         }
         if(CountMyOpenOrders(OP_SELL) >= MaxOpenPositionsPerSide) return;
      }
      double lotOs = ComputeLotByRiskPercent(OP_SELL, sl, FixedLot, riskPercent);
      OpenOrder(OP_SELL, lotOs, sl, tp, reason);
      return;
   }
}

int OnInit() {
   int timerSeconds = PollSeconds;
   if(timerSeconds < 5) timerSeconds = 5;
   EventSetTimer(timerSeconds);
   if(StringLen(ApiKey) < 8) Print("Bridge: ApiKey is empty.");
   Print("TitanAI_XAUUSD_BRIDGE initialized. baseUrl=", GetApiBaseUrl());
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTick() {}
void OnTimer() { HandleSignal(); }

