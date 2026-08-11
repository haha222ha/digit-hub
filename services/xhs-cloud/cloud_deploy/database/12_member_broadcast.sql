-- 会员站内广播已读记录（一次性弹窗推送）
SET search_path TO xhs_monitor, public;

CREATE TABLE IF NOT EXISTS member_broadcast_acks (
    user_id INT NOT NULL REFERENCES users(id),
    broadcast_id VARCHAR(64) NOT NULL,
    acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, broadcast_id)
);

CREATE INDEX IF NOT EXISTS idx_member_broadcast_acks_bid
    ON member_broadcast_acks (broadcast_id, acknowledged_at DESC);
