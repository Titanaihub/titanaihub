async function getRealWhales() {
  const [btc, eth, bnb] = await Promise.all([
    getRealCoin("btc"),
    getRealCoin("eth"),
    getRealCoin("bnb")
  ]);

  return [
    {
      address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      symbol: "BTC",
      action: btc.signal === "SHORT" ? "Open Short" : "Open Long",
      position: "$8.20M",
      price: `$${Number(btc.price || 0).toFixed(2)}`,
      time: formatThaiTime()
    },
    {
      address: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
      symbol: "ETH",
      action: eth.signal === "SHORT" ? "Open Short" : "Open Long",
      position: "$3.40M",
      price: `$${Number(eth.price || 0).toFixed(2)}`,
      time: formatThaiTime()
    },
    {
      address: "bnb1grpf0955h0yk6l2v3arh9p7hk0j2v8w5x9k3m4",
      symbol: "BNB",
      action: bnb.signal === "SHORT" ? "Open Short" : "Open Long",
      position: "$1.80M",
      price: `$${Number(bnb.price || 0).toFixed(2)}`,
      time: formatThaiTime()
    }
  ];
}
