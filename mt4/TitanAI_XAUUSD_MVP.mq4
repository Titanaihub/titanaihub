#property strict
// TitanAI XAUUSD — ติดตั้ง: (1) ใส่ ApiKey ให้ตรงกับ MT4_SHARED_SECRET บน Render
// (2) Tools → Options → Expert Advisors → Allow WebRequest → เพิ่มโดเมน API
// (3) ชาร์ต M5 XAUUSD, AutoTrading เปิด, คอมไพล์ EA แล้วลากแนบ

// ---------- API ----------
input string ApiBaseUrl = "https://titan-ai-api.onrender.com";
input string ApiKey = "";
input int PollSeconds = 60;

// ---------- ออเดอร์ ----------
input int SlippagePoints = 35;
input int MaxSpreadPoints = 45;
input int MagicNumber = 260326;
input double FixedLot = 0.10;
input bool UseAiRiskSizing = true;
input double AiRiskPercentDefault = 0.30;
input double AiRiskPercentMin = 0.10;
input double AiRiskPercentMax = 2.00;
input bool ForceMinLotOverride = true;
input double ForcedMinLot = 0.10;
input int MinStopDistancePoints = 600;
input int MinSecondsBetweenEntries = 1200;
input int MinM5BarsBetweenNewEntries = 6;
input bool AllowScaleIn = true;
input int MaxOpenBuyPositions = 2;
input int MaxOpenSellPositions = 2;
input int MinSecondsBetweenScaleIns = 900;
input int MinM5BarsBetweenScaleIns = 3;

// ---------- สัญญาณ (สอดคล้องกับเซิร์ฟเวอร์: ไม่สแกลปถี่) ----------
input bool TradeOnlyM5Close = true;
input int CandlesToSend = 120;

// ---------- Bootstrap / ประวัติ ----------
input bool BootstrapHistoryFirst = true;
input int BootstrapYears = 10;
input bool BootstrapAllHistory = false;
input int BootstrapChunkCandles = 350;
input int LiveHistoryUpdateMinutes = 15;
input bool BootstrapIncludeH1H4 = true;
input bool BootstrapIncludeM15M30 = true;
input bool BootstrapIncludeM5 = true;
input bool BootstrapIncludeM1 = true;
input bool IncrementalSyncResume = true;
input bool PostBootstrapSeedHistory = true;

// ---------- โหมด AI / ป้องกันกำไร ----------
input bool AiFullControlMode = true;
input bool EnableProfitProtect = true;
input bool ProfitProtectWithAiControl = true;
input int ProfitLockStartPoints = 120;
input int ProfitLockGivebackPoints = 60;
input int BreakEvenAtPoints = 90;
input int BreakEvenOffsetPoints = 10;
input int TrailStartPoints = 160;
input int TrailDistancePoints = 90;
input int TrailStepPoints = 20;

// ---------- Spike guard ----------
input bool EnableSpikeGuard = true;
input double SpikeRangeMultiplier = 2.8;
input int SpikeLookbackBars = 24;
input int SpikeCooldownMinutes = 10;
input bool SpikeEmergencyClose = true;
input int SpikeMinRangePoints = 140;

datetime g_lastBarTime = 0;
datetime g_lastEntryTime = 0;
datetime g_lastOpenM5BarTime = 0;
datetime g_lastScaleInTime = 0;
datetime g_lastScaleInM5BarTime = 0;
bool g_bootstrapInited = false;
bool g_bootstrapDone = false;
int g_bootstrapStage = 0; // 0=D1,1=H4,2=H1,3=M30,4=M15,5=M5,6=M1,7=done
int g_bootstrapShiftD1 = 0;
int g_bootstrapShiftH4 = 0;
int g_bootstrapShiftH1 = 0;
int g_bootstrapShiftM30 = 0;
int g_bootstrapShiftM15 = 0;
int g_bootstrapShiftM5 = 0;
int g_bootstrapShiftM1 = 0;
datetime g_lastHistoryPushAt = 0;
datetime g_spikeCooldownUntil = 0;
datetime g_lastSpikeBarTime = 0;
bool g_postBootstrapSeedDone = false;
int g_profitTrackTickets[300];
double g_profitTrackMaxPts[300];

int FindProfitTrackIndex(int ticket) {
   for(int i = 0; i < 300; i++) {
      if(g_profitTrackTickets[i] == ticket) return i;
   }
   return -1;
}

int EnsureProfitTrackIndex(int ticket) {
   int idx = FindProfitTrackIndex(ticket);
   if(idx >= 0) return idx;
   for(int i = 0; i < 300; i++) {
      if(g_profitTrackTickets[i] == 0) {
         g_profitTrackTickets[i] = ticket;
         g_profitTrackMaxPts[i] = 0.0;
         return i;
      }
   }
   return -1;
}

void CleanupProfitTrack() {
   for(int i = 0; i < 300; i++) {
      int tk = g_profitTrackTickets[i];
      if(tk <= 0) continue;
      if(!OrderSelect(tk, SELECT_BY_TICKET, MODE_TRADES) || OrderCloseTime() > 0) {
         g_profitTrackTickets[i] = 0;
         g_profitTrackMaxPts[i] = 0.0;
      }
   }
}

bool ModifyOrderSL(int ticket, double newSL) {
   if(!OrderSelect(ticket, SELECT_BY_TICKET, MODE_TRADES)) return false;
   newSL = NormalizeDouble(newSL, Digits);
   double oldSL = OrderStopLoss();
   if(MathAbs(newSL - oldSL) < (TrailStepPoints * Point)) return true;
   bool ok = OrderModify(ticket, OrderOpenPrice(), newSL, OrderTakeProfit(), 0, clrDeepSkyBlue);
   if(!ok) {
      Print("TitanAI OrderModify failed ticket=", ticket, " err=", GetLastError());
      return false;
   }
   return true;
}

void ManageProfitProtection() {
   if(!EnableProfitProtect) return;
   CleanupProfitTrack();
   for(int i = OrdersTotal() - 1; i >= 0; i--) {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != Symbol()) continue;
      if(OrderMagicNumber() != MagicNumber) continue;
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL) continue;
      int ticket = OrderTicket();
      int idx = EnsureProfitTrackIndex(ticket);
      if(idx < 0) continue;
      double openPrice = OrderOpenPrice();
      double nowPts = (type == OP_BUY) ? ((Bid - openPrice) / Point) : ((openPrice - Ask) / Point);
      if(nowPts > g_profitTrackMaxPts[idx]) g_profitTrackMaxPts[idx] = nowPts;
      double maxPts = g_profitTrackMaxPts[idx];

      if(maxPts >= ProfitLockStartPoints && nowPts <= (maxPts - ProfitLockGivebackPoints)) {
         double lots = OrderLots();
         bool closed = (type == OP_BUY)
            ? OrderClose(ticket, lots, Bid, SlippagePoints, clrTomato)
            : OrderClose(ticket, lots, Ask, SlippagePoints, clrTomato);
         if(closed) {
            SendExecution("CLOSE", lots, (type == OP_BUY ? Bid : Ask), 0.0, ticket, "profit_retrace_lock");
            g_profitTrackTickets[idx] = 0;
            g_profitTrackMaxPts[idx] = 0.0;
         } else {
            Print("TitanAI profit lock close failed ticket=", ticket, " err=", GetLastError());
         }
         continue;
      }

      if(nowPts >= BreakEvenAtPoints) {
         double beSL = (type == OP_BUY)
            ? (openPrice + BreakEvenOffsetPoints * Point)
            : (openPrice - BreakEvenOffsetPoints * Point);
         double curSL = OrderStopLoss();
         bool betterBE = (type == OP_BUY)
            ? (curSL <= 0 || beSL > curSL)
            : (curSL <= 0 || beSL < curSL);
         if(betterBE) ModifyOrderSL(ticket, beSL);
      }

      if(nowPts >= TrailStartPoints) {
         double trailSL = (type == OP_BUY)
            ? (Bid - TrailDistancePoints * Point)
            : (Ask + TrailDistancePoints * Point);
         double cur = OrderStopLoss();
         bool betterTrail = (type == OP_BUY)
            ? (cur <= 0 || trailSL > cur + TrailStepPoints * Point)
            : (cur <= 0 || trailSL < cur - TrailStepPoints * Point);
         if(betterTrail) ModifyOrderSL(ticket, trailSL);
      }
   }
}

double RangePointsByShift(int period, int shift) {
   double h = iHigh(Symbol(), period, shift);
   double l = iLow(Symbol(), period, shift);
   if(h <= 0 || l <= 0 || h < l) return 0.0;
   return (h - l) / Point;
}

double AvgRangePoints(int period, int lookback) {
   int n = MathMax(5, lookback);
   double sum = 0.0;
   int cnt = 0;
   for(int i = 2; i < 2 + n; i++) {
      double rp = RangePointsByShift(period, i);
      if(rp <= 0) continue;
      sum += rp;
      cnt++;
   }
   if(cnt <= 0) return 0.0;
   return sum / cnt;
}

void RunSpikeGuard() {
   if(!EnableSpikeGuard) return;
   datetime barTime = iTime(Symbol(), PERIOD_M5, 1);
   if(barTime <= 0) return;
   if(g_lastSpikeBarTime == barTime) return;
   g_lastSpikeBarTime = barTime;

   double lastRange = RangePointsByShift(PERIOD_M5, 1);
   double avgRange = AvgRangePoints(PERIOD_M5, SpikeLookbackBars);
   double mult = MathMax(1.2, SpikeRangeMultiplier);
   bool isSpike = (lastRange >= MathMax(SpikeMinRangePoints, avgRange * mult));
   if(!isSpike) return;

   g_spikeCooldownUntil = TimeCurrent() + MathMax(1, SpikeCooldownMinutes) * 60;
   Print("TitanAI spike guard triggered: lastRangePts=", lastRange, " avgRangePts=", avgRange, " cooldownUntil=", TimeToString(g_spikeCooldownUntil, TIME_DATE|TIME_SECONDS));

   if(!SpikeEmergencyClose) return;
   if(CountMyOpenOrders() <= 0) return;
   CloseAllMyPositions("spike_emergency_close");
}

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

int BarsPerDayByPeriod(int period) {
   if(period == PERIOD_M1) return 1440;
   if(period == PERIOD_D1) return 1;
   if(period == PERIOD_H4) return 6;
   if(period == PERIOD_H1) return 24;
   if(period == PERIOD_M5) return 288;
   return 1;
}

int TargetRowsByPeriod(int period) {
   int bars = iBars(Symbol(), period);
   int maxByBroker = MathMax(30, bars - 2);
   int wanted = MathMax(30, BootstrapYears * 365 * BarsPerDayByPeriod(period));
   if(BootstrapAllHistory) return maxByBroker;
   return MathMin(maxByBroker, wanted);
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
      arr += "\"profit\":" + NumToStr(OrderProfit() + OrderSwap() + OrderCommission(), 2) + ",";
      arr += "\"minutesOpen\":" + IntegerToString((int)((TimeCurrent() - OrderOpenTime()) / 60));
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

bool HttpGetJson(string endpoint, string &responseOut) {
   string url = GetApiBaseUrl() + endpoint;
   char postData[];
   ArrayResize(postData, 0);
   char result[];
   string headers = "Accept: application/json\r\nX-MT4-Key: " + ApiKey + "\r\n";
   string resultHeaders = "";
   int timeout = 6000;
   int code = WebRequest("GET", url, headers, timeout, postData, result, resultHeaders);
   if(code == -1) {
      Print("TitanAI WebRequest(GET) error: ", GetLastError(), " url=", url);
      return false;
   }
   responseOut = CharArrayToString(result, 0, -1, CP_UTF8);
   if(code < 200 || code >= 300) {
      Print("TitanAI HTTP(GET) status=", code, " body=", responseOut);
      return false;
   }
   return true;
}

string BuildHistoryUploadPayload(string mode, int period, int startShift, int count, bool doneFlag) {
   int targetRows = MathMax(365, TargetRowsByPeriod(period));
   string payload = "{";
   payload += "\"apiKey\":\"" + JsonEscape(ApiKey) + "\",";
   payload += "\"accountId\":\"" + IntegerToString(AccountNumber()) + "\",";
   payload += "\"symbol\":\"XAUUSD\",";
   payload += "\"timeframe\":\"" + TfLabelByPeriod(period) + "\",";
   payload += "\"mode\":\"" + JsonEscape(mode) + "\",";
   payload += "\"done\":" + (doneFlag ? "true" : "false") + ",";
   payload += "\"targetRows\":" + IntegerToString(targetRows) + ",";
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
   g_bootstrapShiftD1 = TargetRowsByPeriod(PERIOD_D1);
   g_bootstrapShiftH4 = TargetRowsByPeriod(PERIOD_H4);
   g_bootstrapShiftH1 = TargetRowsByPeriod(PERIOD_H1);
   g_bootstrapShiftM30 = TargetRowsByPeriod(PERIOD_M30);
   g_bootstrapShiftM15 = TargetRowsByPeriod(PERIOD_M15);
   g_bootstrapShiftM5 = TargetRowsByPeriod(PERIOD_M5);
   g_bootstrapShiftM1 = TargetRowsByPeriod(PERIOD_M1);
   if(IncrementalSyncResume) {
      int d1Resume = NextShiftAfterTs(PERIOD_D1, GetRemoteLastTsMs("D1"));
      int h4Resume = NextShiftAfterTs(PERIOD_H4, GetRemoteLastTsMs("H4"));
      int h1Resume = NextShiftAfterTs(PERIOD_H1, GetRemoteLastTsMs("H1"));
      int m30Resume = NextShiftAfterTs(PERIOD_M30, GetRemoteLastTsMs("M30"));
      int m15Resume = NextShiftAfterTs(PERIOD_M15, GetRemoteLastTsMs("M15"));
      int m5Resume = NextShiftAfterTs(PERIOD_M5, GetRemoteLastTsMs("M5"));
      int m1Resume = NextShiftAfterTs(PERIOD_M1, GetRemoteLastTsMs("M1"));
      if(d1Resume >= 0) g_bootstrapShiftD1 = MathMin(g_bootstrapShiftD1, d1Resume);
      if(h4Resume >= 0) g_bootstrapShiftH4 = MathMin(g_bootstrapShiftH4, h4Resume);
      if(h1Resume >= 0) g_bootstrapShiftH1 = MathMin(g_bootstrapShiftH1, h1Resume);
      if(m30Resume >= 0) g_bootstrapShiftM30 = MathMin(g_bootstrapShiftM30, m30Resume);
      if(m15Resume >= 0) g_bootstrapShiftM15 = MathMin(g_bootstrapShiftM15, m15Resume);
      if(m5Resume >= 0) g_bootstrapShiftM5 = MathMin(g_bootstrapShiftM5, m5Resume);
      if(m1Resume >= 0) g_bootstrapShiftM1 = MathMin(g_bootstrapShiftM1, m1Resume);
   }
   g_bootstrapStage = 0;
   g_bootstrapInited = true;
   bool hasAnyWork = (g_bootstrapShiftD1 > 0)
      || (BootstrapIncludeH1H4 && (g_bootstrapShiftH4 > 0 || g_bootstrapShiftH1 > 0))
      || (BootstrapIncludeM15M30 && (g_bootstrapShiftM30 > 0 || g_bootstrapShiftM15 > 0))
      || (BootstrapIncludeM5 && g_bootstrapShiftM5 > 0)
      || (BootstrapIncludeM1 && g_bootstrapShiftM1 > 0);
   g_bootstrapDone = !hasAnyWork;
   if(g_bootstrapDone) {
      Print("TitanAI bootstrap skipped (no available bars in enabled timeframes).");
   } else {
      Print("TitanAI bootstrap: D1 startShift=", g_bootstrapShiftD1, " (bars to upload from D1; 0 means full incremental sync — D1/H1 seed runs after bootstrap if enabled)");
   }
}

void RunBootstrapStep() {
   if(!g_bootstrapInited) InitBootstrapState();
   if(g_bootstrapDone) return;
   if(!BootstrapIncludeH1H4 && (g_bootstrapStage == 1 || g_bootstrapStage == 2)) g_bootstrapStage = 3;
   if(!BootstrapIncludeM15M30 && (g_bootstrapStage == 3 || g_bootstrapStage == 4)) g_bootstrapStage = 5;
   if(!BootstrapIncludeM5 && g_bootstrapStage == 5) g_bootstrapStage = 6;
   if(!BootstrapIncludeM1 && g_bootstrapStage == 6) g_bootstrapStage = 7;
   if(g_bootstrapStage >= 7) {
      g_bootstrapDone = true;
      Print("TitanAI bootstrap completed.");
      return;
   }
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
   } else if(g_bootstrapStage == 3) {
      period = PERIOD_M30;
      startShift = g_bootstrapShiftM30;
      mode = "bootstrap_m30";
   } else if(g_bootstrapStage == 4) {
      period = PERIOD_M15;
      startShift = g_bootstrapShiftM15;
      mode = "bootstrap_m15";
   } else if(g_bootstrapStage == 5) {
      period = PERIOD_M5;
      startShift = g_bootstrapShiftM5;
      mode = "bootstrap_m5";
   } else if(g_bootstrapStage == 6) {
      period = PERIOD_M1;
      startShift = g_bootstrapShiftM1;
      mode = "bootstrap_m1";
   }
   bool allStagesDone =
      (g_bootstrapStage >= 2 || !BootstrapIncludeH1H4) &&
      (g_bootstrapStage >= 4 || !BootstrapIncludeM15M30) &&
      (g_bootstrapStage >= 5 || !BootstrapIncludeM5) &&
      (g_bootstrapStage >= 6 || !BootstrapIncludeM1);
   if(startShift < 1) {
      if(allStagesDone) {
         g_bootstrapDone = true;
         Print("TitanAI bootstrap completed.");
      } else {
         g_bootstrapStage++;
      }
      return;
   }
   int count = MathMin(chunk, startShift);
   int endShift = MathMax(1, startShift - count + 1);
   bool finalChunk = (endShift <= 1 && allStagesDone);
   bool ok = UploadHistoryChunk(mode, period, startShift, count, finalChunk);
   if(!ok) {
      Print("TitanAI bootstrap chunk upload failed period=", TfLabelByPeriod(period), " shift=", startShift);
      return;
   }
   if(g_bootstrapStage == 0) g_bootstrapShiftD1 = endShift - 1;
   if(g_bootstrapStage == 1) g_bootstrapShiftH4 = endShift - 1;
   if(g_bootstrapStage == 2) g_bootstrapShiftH1 = endShift - 1;
   if(g_bootstrapStage == 3) g_bootstrapShiftM30 = endShift - 1;
   if(g_bootstrapStage == 4) g_bootstrapShiftM15 = endShift - 1;
   if(g_bootstrapStage == 5) g_bootstrapShiftM5 = endShift - 1;
   if(g_bootstrapStage == 6) g_bootstrapShiftM1 = endShift - 1;
   if(endShift <= 1) {
      if(allStagesDone) {
         g_bootstrapDone = true;
         Print("TitanAI bootstrap completed.");
      } else {
         g_bootstrapStage++;
         Print("TitanAI bootstrap stage advanced to ", g_bootstrapStage);
      }
   }
}

void RunPostBootstrapSeedOnce() {
   if(!PostBootstrapSeedHistory || g_postBootstrapSeedDone) return;
   if(!g_bootstrapDone) return;
   int barsD1 = iBars(Symbol(), PERIOD_D1);
   if(barsD1 < 25) {
      Print("TitanAI: WARNING — only ", barsD1, " D1 bars in terminal. Right-click chart -> Refresh, or open a daily chart to load history for trend context.");
      g_postBootstrapSeedDone = true;
      return;
   }
   int sd1 = MathMin(barsD1 - 2, 400);
   int cd1 = MathMin(150, sd1);
   bool okD1 = false;
   if(cd1 > 0) okD1 = UploadHistoryChunk("ea_seed_d1_trend", PERIOD_D1, sd1, cd1, false);
   int barsH1 = iBars(Symbol(), PERIOD_H1);
   bool okH1 = false;
   if(barsH1 >= 40) {
      int sh = MathMin(barsH1 - 2, 400);
      int ch = MathMin(240, sh);
      if(ch > 0) okH1 = UploadHistoryChunk("ea_seed_h1_trend", PERIOD_H1, sh, ch, false);
   }
   g_postBootstrapSeedDone = true;
   Print("TitanAI: trend seed done — D1 ", (okD1 ? "ok" : "fail"), " (", cd1, " bars), H1 ", (okH1 ? "ok" : "skip/fail"));
}

void PushLiveHistoryIfDue() {
   int mins = MathMax(1, LiveHistoryUpdateMinutes);
   if(g_lastHistoryPushAt > 0 && (TimeCurrent() - g_lastHistoryPushAt) < mins * 60) return;
   bool ok = false;
   int barsM5 = iBars(Symbol(), PERIOD_M5);
   if(barsM5 >= 40) {
      int s5 = MathMin(barsM5 - 2, 320);
      int resume5 = NextShiftAfterTs(PERIOD_M5, GetRemoteLastTsMs("M5"));
      if(resume5 >= 0) s5 = MathMin(s5, resume5);
      int c5 = MathMin(280, s5);
      if(c5 > 0 && UploadHistoryChunk("live_append_m5", PERIOD_M5, s5, c5, false)) ok = true;
   }
   int barsM1 = iBars(Symbol(), PERIOD_M1);
   if(barsM1 >= 40) {
      int s1m = MathMin(barsM1 - 2, 900);
      int resume1m = NextShiftAfterTs(PERIOD_M1, GetRemoteLastTsMs("M1"));
      if(resume1m >= 0) s1m = MathMin(s1m, resume1m);
      int c1m = MathMin(800, s1m);
      if(c1m > 0 && UploadHistoryChunk("live_append_m1", PERIOD_M1, s1m, c1m, false)) ok = true;
   }
   int barsH1 = iBars(Symbol(), PERIOD_H1);
   if(barsH1 >= 40) {
      int s1 = MathMin(barsH1 - 2, 260);
      int resume1 = NextShiftAfterTs(PERIOD_H1, GetRemoteLastTsMs("H1"));
      if(resume1 >= 0) s1 = MathMin(s1, resume1);
      int c1 = MathMin(220, s1);
      if(c1 > 0 && UploadHistoryChunk("live_append_h1", PERIOD_H1, s1, c1, false)) ok = true;
   }
   int barsH4 = iBars(Symbol(), PERIOD_H4);
   int barsM30 = iBars(Symbol(), PERIOD_M30);
   if(barsM30 >= 40) {
      int s30 = MathMin(barsM30 - 2, 260);
      int resume30 = NextShiftAfterTs(PERIOD_M30, GetRemoteLastTsMs("M30"));
      if(resume30 >= 0) s30 = MathMin(s30, resume30);
      int c30 = MathMin(220, s30);
      if(c30 > 0 && UploadHistoryChunk("live_append_m30", PERIOD_M30, s30, c30, false)) ok = true;
   }
   int barsM15 = iBars(Symbol(), PERIOD_M15);
   if(barsM15 >= 40) {
      int s15 = MathMin(barsM15 - 2, 260);
      int resume15 = NextShiftAfterTs(PERIOD_M15, GetRemoteLastTsMs("M15"));
      if(resume15 >= 0) s15 = MathMin(s15, resume15);
      int c15 = MathMin(220, s15);
      if(c15 > 0 && UploadHistoryChunk("live_append_m15", PERIOD_M15, s15, c15, false)) ok = true;
   }
   if(barsH4 >= 40) {
      int s4 = MathMin(barsH4 - 2, 260);
      int resume4 = NextShiftAfterTs(PERIOD_H4, GetRemoteLastTsMs("H4"));
      if(resume4 >= 0) s4 = MathMin(s4, resume4);
      int c4 = MathMin(220, s4);
      if(c4 > 0 && UploadHistoryChunk("live_append_h4", PERIOD_H4, s4, c4, false)) ok = true;
   }
   int barsD1 = iBars(Symbol(), PERIOD_D1);
   if(barsD1 >= 5) {
      int sd1 = MathMin(barsD1 - 2, 400);
      int resumeD1 = NextShiftAfterTs(PERIOD_D1, GetRemoteLastTsMs("D1"));
      if(resumeD1 >= 0) sd1 = MathMin(sd1, resumeD1);
      int cd1 = MathMin(120, sd1);
      if(cd1 > 0 && UploadHistoryChunk("live_append_d1", PERIOD_D1, sd1, cd1, false)) ok = true;
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

double GetRemoteLastTsMs(string timeframe) {
   if(!IncrementalSyncResume) return 0.0;
   string endpoint = "/api/mt4/gold/sync-state?symbol=XAUUSD&timeframe=" + timeframe + "&accountId=" + IntegerToString(AccountNumber());
   string rsp = "";
   if(!HttpGetJson(endpoint, rsp)) return 0.0;
   return JsonGetNumber(rsp, "lastTsMs", 0.0);
}

int NextShiftAfterTs(int period, double lastTsMs) {
   if(lastTsMs <= 0) return -1;
   datetime ts = (datetime)MathFloor(lastTsMs / 1000.0);
   int bars = iBars(Symbol(), period);
   if(bars < 5) return -1;
   for(int i = 1; i <= bars - 2; i++) {
      datetime t = iTime(Symbol(), period, i);
      if(t <= ts) {
         return i - 1;
      }
   }
   return bars - 2;
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
   double maxLot = MarketInfo(Symbol(), MODE_MAXLOT);
   double step = MarketInfo(Symbol(), MODE_LOTSTEP);
   if(ForceMinLotOverride && ForcedMinLot > 0) minLot = MathMax(minLot, ForcedMinLot);
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

   double equity = AccountEquity();
   double riskMoney = equity * (riskPercent / 100.0);
   if(riskMoney <= 0) return ClampLotToBroker(fallbackLot);

   double lot = riskMoney / (slDist * moneyPerPricePerLot);
   return ClampLotToBroker(lot);
}

bool OpenOrder(int type, double lot, double sl, double tp, string reason, bool isScaleIn) {
   if(!AiFullControlMode) {
      if(isScaleIn) {
         if(MinSecondsBetweenScaleIns > 0 && g_lastScaleInTime > 0) {
            int need2 = (int)(TimeCurrent() - g_lastScaleInTime);
            if(need2 < MinSecondsBetweenScaleIns) {
               Print("TitanAI skip scale open (cooldown): ", need2, "s < ", MinSecondsBetweenScaleIns, "s");
               return false;
            }
         }
      } else {
         if(MinSecondsBetweenEntries > 0 && g_lastEntryTime > 0) {
            int need = (int)(TimeCurrent() - g_lastEntryTime);
            if(need < MinSecondsBetweenEntries) {
               Print("TitanAI skip open (entry cooldown): ", need, "s < ", MinSecondsBetweenEntries, "s");
               return false;
            }
         }
      }
   }
   double price = (type == OP_BUY ? Ask : Bid);
   lot = MathMax(MarketInfo(Symbol(), MODE_MINLOT), lot);
   lot = NormalizeDouble(lot, 2);
   sl = (sl > 0 ? NormalizeDouble(sl, Digits) : 0.0);
   tp = (tp > 0 ? NormalizeDouble(tp, Digits) : 0.0);
   if(!AiFullControlMode) {
      double minDist = MathMax(0, MinStopDistancePoints) * Point;
      if(minDist > 0) {
         if(type == OP_BUY) {
            if(sl <= 0 || (price - sl) < minDist) sl = NormalizeDouble(price - minDist, Digits);
         } else {
            if(sl <= 0 || (sl - price) < minDist) sl = NormalizeDouble(price + minDist, Digits);
         }
      }
   }
   int ticket = OrderSend(Symbol(), type, lot, price, SlippagePoints, sl, tp, "TitanAI", MagicNumber, 0, clrDeepSkyBlue);
   if(ticket < 0) {
      Print("TitanAI OrderSend failed err=", GetLastError(), " reason=", reason);
      return false;
   }
   if(isScaleIn) {
      g_lastScaleInTime = TimeCurrent();
      g_lastScaleInM5BarTime = iTime(Symbol(), PERIOD_M5, 0);
   } else {
      g_lastEntryTime = TimeCurrent();
      g_lastOpenM5BarTime = iTime(Symbol(), PERIOD_M5, 0);
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
   if(!AiFullControlMode) {
      if(TradeOnlyM5Close && !IsNewBar()) return;
      if(EnableSpikeGuard && g_spikeCooldownUntil > TimeCurrent()) return;
   }

   string payload = BuildSignalPayload();
   string rsp = "";
   if(!HttpPostJson("/api/mt4/gold/signal", payload, rsp)) return;

   string action, reason;
   double sl, tp;
   double riskPercent = -1.0;
   ParseDecision(rsp, action, sl, tp, reason, riskPercent);
   action = Upper(action);

   if(action == "WAIT") return;
   if(action == "CLOSE_ALL") {
      CloseAllMyPositions(reason);
      return;
   }

  if(!AiFullControlMode) {
     // Min bar gap for scale-in (different from new entry).
     if((action == "SCALE_IN_BUY" || action == "SCALE_IN_SELL") && MinM5BarsBetweenScaleIns > 0 && g_lastScaleInM5BarTime > 0) {
        int sh = iBarShift(Symbol(), PERIOD_M5, g_lastScaleInM5BarTime);
        if(sh >= 0 && sh < MinM5BarsBetweenScaleIns) {
           Print("TitanAI skip scale open (min M5 bars): ", sh, " need>= ", MinM5BarsBetweenScaleIns);
           return;
        }
        // sh < 0: bar not in history (gap) — allow open
     }

     // Min bar gap for brand-new entries.
     if((action == "OPEN_BUY" || action == "OPEN_SELL") && MinM5BarsBetweenNewEntries > 0 && g_lastOpenM5BarTime > 0) {
        int sh2 = iBarShift(Symbol(), PERIOD_M5, g_lastOpenM5BarTime);
        if(sh2 >= 0 && sh2 < MinM5BarsBetweenNewEntries) {
           Print("TitanAI skip open (min M5 bars): ", sh2, " need>= ", MinM5BarsBetweenNewEntries);
           return;
        }
        // sh < 0: bar not in history (gap) — allow open
     }
  }

  if(action == "SCALE_IN_BUY") {
     if(!AiFullControlMode) {
        if(!AllowScaleIn) return;
        if(CountMyOpenOrders(OP_BUY) >= MaxOpenBuyPositions) return;
        if(CountMyOpenOrders(OP_SELL) > 0) CloseAllMyPositions("scale-in-buy_close_opposite");
     }
     double lotSb = ComputeLotByRiskPercent(OP_BUY, sl, FixedLot, riskPercent);
     OpenOrder(OP_BUY, lotSb, sl, tp, reason, true);
     return;
  }
  if(action == "SCALE_IN_SELL") {
     if(!AiFullControlMode) {
        if(!AllowScaleIn) return;
        if(CountMyOpenOrders(OP_SELL) >= MaxOpenSellPositions) return;
        if(CountMyOpenOrders(OP_BUY) > 0) CloseAllMyPositions("scale-in-sell_close_opposite");
     }
     double lotSs = ComputeLotByRiskPercent(OP_SELL, sl, FixedLot, riskPercent);
     OpenOrder(OP_SELL, lotSs, sl, tp, reason, true);
     return;
  }

  if(action == "OPEN_BUY") {
     if(!AiFullControlMode) {
        if(CountMyOpenOrders(OP_BUY) > 0) return;
        if(CountMyOpenOrders(OP_SELL) > 0) CloseAllMyPositions("flip-to-buy");
     }
     double lotOb = ComputeLotByRiskPercent(OP_BUY, sl, FixedLot, riskPercent);
     OpenOrder(OP_BUY, lotOb, sl, tp, reason, false);
     return;
  }
  if(action == "OPEN_SELL") {
     if(!AiFullControlMode) {
        if(CountMyOpenOrders(OP_SELL) > 0) return;
        if(CountMyOpenOrders(OP_BUY) > 0) CloseAllMyPositions("flip-to-sell");
     }
     double lotOs = ComputeLotByRiskPercent(OP_SELL, sl, FixedLot, riskPercent);
     OpenOrder(OP_SELL, lotOs, sl, tp, reason, false);
     return;
  }
}

int OnInit() {
   int timerSeconds = PollSeconds;
   if(timerSeconds < 5) timerSeconds = 5;
   EventSetTimer(timerSeconds);
   if(StringLen(ApiKey) < 8) {
      Print("TitanAI: ApiKey is empty — set EA input ApiKey to match MT4_SHARED_SECRET on Render.");
   }
   Print("TitanAI_XAUUSD_MVP initialized. baseUrl=", GetApiBaseUrl(), ". WebRequest whitelist + ApiKey required.");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) {
   EventKillTimer();
}

void OnTick() {
   // Deliberately lightweight. Main cycle uses timer.
}

void OnTimer() {
   if(!AiFullControlMode) {
      RunSpikeGuard();
      if(EnableProfitProtect) ManageProfitProtection();
   }
   if(BootstrapHistoryFirst && !g_bootstrapDone) {
      RunBootstrapStep();
      return;
   }
   RunPostBootstrapSeedOnce();
   PushLiveHistoryIfDue();
   HandleSignal();
}

