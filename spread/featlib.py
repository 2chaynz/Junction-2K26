import math

def km(PL, a, b):
    A, B = PL[a], PL[b]
    x = (A['lon'] - B['lon']) * math.cos(math.radians((A['lat'] + B['lat']) / 2))
    return 111 * math.hypot(x, A['lat'] - B['lat'])

def feats(rq, homes_cnt, PL, RD, _cache={}):
    leg = rq['legs'][0]; pk = leg['pickup']['placeId']; dl = leg['delivery']['placeId']
    key = (id(homes_cnt),)
    def n(p, r):
        k = (id(homes_cnt), p, r)
        if k not in _cache:
            _cache[k] = sum(c for h, c in homes_cnt.items() if km(PL, h, p) <= r)
        return _cache[k]
    drive = sum(RD[(l['pickup']['placeId'], l['delivery']['placeId'])] for l in rq['legs'])
    return [math.log1p(n(pk, 30)), math.log1p(n(pk, 80)), math.log1p(n(dl, 30)), math.log1p(n(dl, 80)), drive / 60, km(PL, pk, dl) / 100, len(rq['legs']),
            float(leg['pickup']['privateAddress']), float(leg['delivery']['privateAddress']), (rq['arrivedAt'] % 1440) / 60, rq['arrivedAt'] // 1440,
            leg['pickup']['window']['from'] - rq['respondBy'], 1.0 if rq['note'] else 0.0]
