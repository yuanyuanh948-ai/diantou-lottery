-- 抽奖记录表
CREATE TABLE IF NOT EXISTS draws (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname     TEXT    NOT NULL,            -- 学员填的昵称（原样展示）
  phone        TEXT    NOT NULL,            -- 完整手机号 = 唯一身份键
  prize_level  TEXT    NOT NULL,
  reward       TEXT    NOT NULL,
  code         TEXT    NOT NULL UNIQUE,     -- 兑奖码
  ts           INTEGER NOT NULL,            -- 开奖时间（unix 秒，展示时 +8h）
  ip           TEXT    DEFAULT '',
  ua           TEXT    DEFAULT '',
  redeemed     INTEGER NOT NULL DEFAULT 0,  -- 是否已核销
  redeemed_at  INTEGER
);

-- 一个手机号只能抽一次（数据库层强制，换昵称也没用）
CREATE UNIQUE INDEX IF NOT EXISTS idx_phone ON draws(phone);
CREATE INDEX IF NOT EXISTS idx_ts ON draws(ts);
CREATE INDEX IF NOT EXISTS idx_ip_ts ON draws(ip, ts);
