# -*- coding: utf-8 -*-

"""从 items 数组构建与 gen_report 对齐的 charts / top_keywords / top_stores。"""

from __future__ import annotations



import re

from collections import Counter



from cloud_deploy.reporting.constants import item_at



PRICE_ORDER = ["0-30", "30-50", "50-100", "100-200", "200-500", ">500"]

SOLD_ORDER = ["0-100", "100-500", "500-1k", "1k-5k", "5k-1w", ">1w"]

V1D_ORDER = ["0-5", "5-10", "10-20", "20-50", "50-100", ">100"]

GR_ORDER = ["0-5%", "5-10%", "10-20%", "20-50%", "50-100%", ">100%"]

VSR_ORDER = ["0-1%", "1-5%", "5-10%", "10-20%", "20-50%", ">50%"]



STOP_WORDS = {

    "的", "了", "和", "与", "及", "或", "等", "款", "型", "版", "件", "个", "套",

}





def _price_bucket(p: float) -> str:

    if p <= 30:

        return "0-30"

    if p <= 50:

        return "30-50"

    if p <= 100:

        return "50-100"

    if p <= 200:

        return "100-200"

    if p <= 500:

        return "200-500"

    return ">500"





def _sold_bucket(s: int) -> str:

    if s <= 100:

        return "0-100"

    if s <= 500:

        return "100-500"

    if s <= 1000:

        return "500-1k"

    if s <= 5000:

        return "1k-5k"

    if s <= 10000:

        return "5k-1w"

    return ">1w"





def _v1d_bucket(v: float) -> str:

    if v <= 5:

        return "0-5"

    if v <= 10:

        return "5-10"

    if v <= 20:

        return "10-20"

    if v <= 50:

        return "20-50"

    if v <= 100:

        return "50-100"

    return ">100"





def _gr_bucket(gr_pct: float) -> str:

    if gr_pct <= 5:

        return "0-5%"

    if gr_pct <= 10:

        return "5-10%"

    if gr_pct <= 20:

        return "10-20%"

    if gr_pct <= 50:

        return "20-50%"

    if gr_pct <= 100:

        return "50-100%"

    return ">100%"





def _vsr_bucket(vsr_ratio: float) -> str:

    if vsr_ratio <= 0.01:

        return "0-1%"

    if vsr_ratio <= 0.05:

        return "1-5%"

    if vsr_ratio <= 0.1:

        return "5-10%"

    if vsr_ratio <= 0.2:

        return "10-20%"

    if vsr_ratio <= 0.5:

        return "20-50%"

    return ">50%"





def _ordered_dict(counter: Counter, order: list[str]) -> dict[str, int]:

    return {k: int(counter.get(k, 0)) for k in order}





def build_charts_and_tops(items: list) -> tuple[dict, list, list]:

    price_dist: Counter = Counter()

    sold_dist: Counter = Counter()

    v1d_dist: Counter = Counter()

    actual_gr_dist: Counter = Counter()
    gr_est_dist: Counter = Counter()
    vsr_dist: Counter = Counter()

    actual_vsr_dist: Counter = Counter()

    keyword_counter: Counter = Counter()

    store_counter: Counter = Counter()



    for item in items:

        price = float(item_at(item, "price", 0) or 0)

        sold = int(item_at(item, "sold", 0) or 0)

        actual_v1d = float(item_at(item, "actual_v1d", 0) or 0)

        v1d = float(item_at(item, "v1d", 0) or 0)

        actual_gr = float(item_at(item, "actual_gr", 0) or 0)
        gr = float(item_at(item, "gr", 0) or 0)
        actual_vsr = float(item_at(item, "actual_vsr", 0) or 0)
        vsr = float(item_at(item, "vsr", 0) or 0)



        if price > 0:

            price_dist[_price_bucket(price)] += 1

        sold_dist[_sold_bucket(sold)] += 1

        v1d_dist[_v1d_bucket(v1d)] += 1

        if actual_gr > 0:
            actual_gr_dist[_gr_bucket(actual_gr)] += 1
        if gr > 0:
            gr_est_dist[_gr_bucket(gr)] += 1

        if vsr > 0:

            vsr_dist[_vsr_bucket(vsr)] += 1

        if actual_vsr > 0:

            actual_vsr_dist[_vsr_bucket(actual_vsr)] += 1



        store_name = item_at(item, "store_name", "") or ""

        if store_name:

            store_counter[str(store_name)] += 1



        title = str(item_at(item, "title", "") or "")

        for w in re.split(r"[\s·|/\\【】\[\]（）()《》<>「」\"\"''\-—_+,.;:!?~`@#$%^&*+=|{}]", title):

            w = w.strip()

            if 2 <= len(w) <= 8 and w not in STOP_WORDS and not w.isdigit():

                keyword_counter[w] += 1



    charts = {

        "price": _ordered_dict(price_dist, PRICE_ORDER),

        "sold": _ordered_dict(sold_dist, SOLD_ORDER),

        "v1d": _ordered_dict(v1d_dist, V1D_ORDER),

        "gr": _ordered_dict(actual_gr_dist, GR_ORDER),
        "gr_snap": _ordered_dict(actual_gr_dist, GR_ORDER),
        "vsr": _ordered_dict(actual_vsr_dist, VSR_ORDER),
        "vsr_est": _ordered_dict(vsr_dist, VSR_ORDER),

    }

    top_keywords = keyword_counter.most_common(30)

    top_stores = store_counter.most_common(20)

    return charts, top_keywords, top_stores

