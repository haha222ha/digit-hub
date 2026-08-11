# -*- coding: utf-8 -*-
"""Resolve visitor IP behind Cloudflare / nginx for pay gateways.

hwxun mapi rejects non-public IPv4 with「用户IP地址不合法」.
"""
from __future__ import annotations

import ipaddress
from typing import Iterable

from fastapi import Request

# Last-resort public IPv4 when visitor is IPv6-only / headers missing.
# Used only for gateway risk field; does not affect auth allowlists.
_PAY_FALLBACK_IPV4 = "1.1.1.1"


def _strip_port(raw: str) -> str:
    s = (raw or "").strip().strip("[]")
    if not s:
        return ""
    # IPv4:port
    if s.count(":") == 1 and "." in s:
        host, _, port = s.rpartition(":")
        if port.isdigit():
            return host
    return s


def _parse_ip(raw: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    s = _strip_port(raw)
    if not s:
        return None
    try:
        return ipaddress.ip_address(s)
    except ValueError:
        return None


def _as_public_ipv4(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> str | None:
    if isinstance(ip, ipaddress.IPv4Address) and ip.is_global:
        return str(ip)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        mapped = ip.ipv4_mapped
        if mapped.is_global:
            return str(mapped)
    return None


def _iter_header_ips(request: Request) -> Iterable[str]:
    # Cloudflare visitor IP first (most accurate on monitor.xhs365.cn)
    for key in ("CF-Connecting-IP", "True-Client-IP", "X-Real-IP"):
        v = (request.headers.get(key) or "").strip()
        if v:
            yield v
    xff = request.headers.get("X-Forwarded-For") or ""
    for part in xff.split(","):
        p = part.strip()
        if p:
            yield p
    if request.client and request.client.host:
        yield request.client.host


def resolve_client_ip(request: Request) -> str:
    """Best-effort client IP string (may be IPv6 / private)."""
    for raw in _iter_header_ips(request):
        ip = _parse_ip(raw)
        if ip is not None:
            return str(ip)
    return ""


def public_ipv4_for_pay(request: Request, fallback: str = _PAY_FALLBACK_IPV4) -> str:
    """Public IPv4 suitable for hwxun ``clientip`` (never empty / private / IPv6)."""
    for raw in _iter_header_ips(request):
        ip = _parse_ip(raw)
        if ip is None:
            continue
        v4 = _as_public_ipv4(ip)
        if v4:
            return v4
    fb = _parse_ip(fallback)
    if fb is not None:
        v4 = _as_public_ipv4(fb)
        if v4:
            return v4
    return _PAY_FALLBACK_IPV4
