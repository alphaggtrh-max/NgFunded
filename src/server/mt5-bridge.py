"""NGFunded MetaTrader 5 market-data bridge.

This process is MARKET DATA ONLY. It never places, modifies, or closes an MT5 order.
It reads bid/ask ticks from a locally running MT5 terminal and publishes them to Redis
for the NGFunded paper-trading engine and WebSocket fanout.

Install:
    python -m pip install -r requirements-mt5.txt

Run from the repository root:
    python src/server/mt5-bridge.py

Environment:
    REDIS_URL=redis://localhost:6379/0
    MT5_SYMBOLS=EURUSD,GBPUSD,USDJPY,XAUUSD,NAS100,US30
    MT5_TERMINAL_PATH=optional path to terminal64.exe
    MT5_LOGIN=optional demo/data account login
    MT5_PASSWORD=optional terminal password
    MT5_SERVER=optional broker server name
    MT5_POLL_INTERVAL_MS=100
"""

import os
import time
from datetime import datetime, timezone

import MetaTrader5 as mt5
import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
SYMBOLS = [s.strip().upper() for s in os.getenv(
    "MT5_SYMBOLS", "EURUSD,GBPUSD,USDJPY,XAUUSD,NAS100,US30"
).split(",") if s.strip()]
POLL_INTERVAL = max(0.02, int(os.getenv("MT5_POLL_INTERVAL_MS", "100")) / 1000)
TERMINAL_PATH = os.getenv("MT5_TERMINAL_PATH")

redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)


def connect_mt5() -> None:
    kwargs = {}
    login = os.getenv("MT5_LOGIN")
    password = os.getenv("MT5_PASSWORD")
    server = os.getenv("MT5_SERVER")

    if login:
        kwargs["login"] = int(login)
    if password:
        kwargs["password"] = password
    if server:
        kwargs["server"] = server

    if TERMINAL_PATH:
        ok = mt5.initialize(TERMINAL_PATH, **kwargs)
    else:
        ok = mt5.initialize(**kwargs)

    if not ok:
        raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")


def publish_tick(symbol: str, tick) -> None:
    payload = {
        "symbol": symbol,
        "bid": float(tick.bid),
        "ask": float(tick.ask),
        "last": float(tick.last or tick.bid),
        "timestamp": int(tick.time_msc or int(tick.time * 1000)),
        "source": "metatrader5",
    }

    import json
    encoded = json.dumps(payload, separators=(",", ":"))
    redis_client.publish("ngf:market:tick", encoded)
    redis_client.set(f"ngf:market:tick:{symbol}", encoded, ex=10)
    redis_client.sadd("ngf:market:symbols", symbol)
    redis_client.set("ngf:market:heartbeat", str(int(time.time() * 1000)), ex=10)


def main() -> None:
    connect_mt5()
    print(f"NGFunded MT5 market-data bridge connected; symbols={','.join(SYMBOLS)}")

    try:
        for symbol in SYMBOLS:
            if not mt5.symbol_select(symbol, True):
                print(f"[MT5] Could not select {symbol}: {mt5.last_error()}")

        while True:
            for symbol in SYMBOLS:
                tick = mt5.symbol_info_tick(symbol)
                if tick is None:
                    continue
                if not tick.bid and not tick.ask:
                    continue
                publish_tick(symbol, tick)
            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        print("Stopping NGFunded MT5 market-data bridge")
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
