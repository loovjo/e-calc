function map_from_dict(d) {
    let res = new Map();
    for (let name of Object.getOwnPropertyNames(d)) {
        res.set(name, d[name]);
    }

    return res;
}

function map_map(f, as) {
    let res = new Map();
    for (let [v, a] of as) {
        res.set(v, f(a));
    }
    return res;
}

function pair_map(f, as, bs) {
    let vs = new Set([...as.keys(), ...bs.keys()]);
    let res = new Map();
    for (let v of vs) {
        let a = as.get(v) || 0;
        let b = bs.get(v) || 0;
        res.set(v, f(a, b));
    }
    return res;
}
// raw uncertain number, i.e. 5 +- 2
// not dependend on any variable
DV_STATIC = '_stat';

class GNum {
    // v = value
    // dv:
    //     undefined: no dv
    //     number: static
    //     string: +1dv
    //     map: map
    constructor(v, dv_or_name) {
        this.v = v;

        if (dv_or_name === undefined) {
            this.dv = new Map();
        } else if (typeof dv_or_name === "number") {
            this.dv = new Map();
            this.dv.set(DV_STATIC, dv_or_name)
        } else if (typeof dv_or_name === "string") {
            this.dv = new Map();
            this.dv.set(dv_or_name, 1)
        }
        else if (dv_or_name instanceof Map)
            this.dv = dv_or_name;

        if (!this.dv.has(DV_STATIC))
            this.dv.set(DV_STATIC, 0);
    }

    set_uncertainty_in_var(var_name) {
        let uncertainty = this.dv.get(DV_STATIC);
        this.dv.set(DV_STATIC, 0);
        this.dv.set(var_name, uncertainty);
    }

    add(other) {
        return new GNum(
            this.v + other.v,
            pair_map((dthis, dother) => dthis + dother, this.dv, other.dv),
        );
    }

    sub(other) {
        let res = new GNum(
            this.v - other.v,
            pair_map((dthis, dother) => dthis - dother, this.dv, other.dv),
        );
        res.dv.set(DV_STATIC, this.dv.get(DV_STATIC) + other.dv.get(DV_STATIC));
        return res;
    }

    mul(other) {
        let res = new GNum(
            this.v * other.v,
            // (a + b dx + c dy + ...) (A + B dx + C dy + ...)
            // = aA + aB dx + aC dy + ... + Ab dx + Bb dx^2 + ... + cA dy + ...
            // = aA + (aB + Ab) dx + (aC + Ac) dy + ... (higher orders die)
            pair_map((dthis, dother) => this.v * dother + other.v * dthis, this.dv, other.dv),
        );
        res.dv.set(DV_STATIC, res.v * (this.dv.get(DV_STATIC) / this.v + other.dv.get(DV_STATIC) / this.v));
        return res;
    }

    abs() {
        if (this.v > 0) {
            return this;
        } else {
            return this.mul(new GNum(-1));
        }
    }

    pow_const(pow) {
        return new GNum(
            Math.pow(this.v, pow),
            map_map(d => pow * d * Math.pow(this.v, pow - 1), this.dv)
        );
    }

    div(other) {
        return this.mul(other.pow_const(-1));
    }

    pretty(show_total) {
        if (show_total) {
            let rel = Math.abs(this.total_range() / this.v);
            if (rel < 1)
                return this.v.toPrecision(6) + " ± " + (rel * 100).toPrecision(2) + "%";
            else
                return this.v.toPrecision(6) + " ± " + this.total_range().toPrecision(6);
        } else {
            let o = this.v.toPrecision(6);
            let pm = this.dv.get(DV_STATIC);
            let rel = Math.abs(pm / this.v);
            if (pm !== 0) {
                if (rel < 1)
                    o += " ± " + (rel * 100).toPrecision(2) + "%";
                else
                    o += " ± " + pm.toPrecision(6);
            }

            for (let [x, d] of this.dv) {
                if (x === DV_STATIC) {
                    continue;
                }
                if (d >= 0) {
                    o += " + " + d.toPrecision(6) + "*" + "d" + x;
                } else {
                    o += " - " + (-d).toPrecision(6) + "*" + "d" + x;
                }
            }
            return o;
        }
    }

    total_range() {
        return [...this.dv.values()].reduce((a, b) => a + Math.abs(b), 0);
    }

    raw_second_moment() {
        let range = this.total_range();
        return 1/3 * (Math.pow(this.v + range, 3) - Math.pow(this.v - range, 3)) / (2 * range)
    }
}

function series(values, tol) {
    return values.map(v => new GNum(v, v * tol));
}

let e3   = series([1.0, 2.2, 4.7], 0.4)
let e6   = series([1.0, 1.5, 2.2, 3.3, 4.7, 6.8], 0.2)
let e12  = series([1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2], 0.1)
let e24  = series([1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1], 0.05)
let e48  = series([1.00, 1.05, 1.10, 1.15, 1.21, 1.27, 1.33, 1.40, 1.47, 1.54, 1.62, 1.69, 1.78, 1.87, 1.96, 2.05, 2.15, 2.26, 2.37, 2.49, 2.61, 2.74, 2.87, 3.01, 3.16, 3.32, 3.48, 3.65, 3.83, 4.02, 4.22, 4.42, 4.64, 4.87, 5.11, 5.36, 5.62, 5.90, 6.19, 6.49, 6.81, 7.15, 7.50, 7.87, 8.25, 8.66, 9.09, 9.53], 0.02)
let e96  = series([1.00, 1.02, 1.05, 1.07, 1.10, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.30, 1.33, 1.37, 1.40, 1.43, 1.47, 1.50, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2.00, 2.05, 2.10, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.80, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24, 3.32, 3.40, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.90, 6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.50, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76], 0.01)
let e192 = series([1.00, 1.01, 1.02, 1.04, 1.05, 1.06, 1.07, 1.09, 1.10, 1.11, 1.13, 1.14, 1.15, 1.17, 1.18, 1.20, 1.21, 1.23, 1.24, 1.26, 1.27, 1.29, 1.30, 1.32, 1.33, 1.35, 1.37, 1.38, 1.40, 1.42, 1.43, 1.45, 1.47, 1.49, 1.50, 1.52, 1.54, 1.56, 1.58, 1.60, 1.62, 1.64, 1.65, 1.67, 1.69, 1.72, 1.74, 1.76, 1.78, 1.80, 1.82, 1.84, 1.87, 1.89, 1.91, 1.93, 1.96, 1.98, 2.00, 2.03, 2.05, 2.08, 2.10, 2.13, 2.15, 2.18, 2.21, 2.23, 2.26, 2.29, 2.32, 2.34, 2.37, 2.40, 2.43, 2.46, 2.49, 2.52, 2.55, 2.58, 2.61, 2.64, 2.67, 2.71, 2.74, 2.77, 2.80, 2.84, 2.87, 2.91, 2.94, 2.98, 3.01, 3.05, 3.09, 3.12, 3.16, 3.20, 3.24, 3.28, 3.32, 3.36, 3.40, 3.44, 3.48, 3.52, 3.57, 3.61, 3.65, 3.70, 3.74, 3.79, 3.83, 3.88, 3.92, 3.97, 4.02, 4.07, 4.12, 4.17, 4.22, 4.27, 4.32, 4.37, 4.42, 4.48, 4.53, 4.59, 4.64, 4.70, 4.75, 4.81, 4.87, 4.93, 4.99, 5.05, 5.11, 5.17, 5.23, 5.30, 5.36, 5.42, 5.49, 5.56, 5.62, 5.69, 5.76, 5.83, 5.90, 5.97, 6.04, 6.12, 6.19, 6.26, 6.34, 6.42, 6.49, 6.57, 6.65, 6.73, 6.81, 6.90, 6.98, 7.06, 7.15, 7.23, 7.32, 7.41, 7.50, 7.59, 7.68, 7.77, 7.87, 7.96, 8.06, 8.16, 8.25, 8.35, 8.45, 8.56, 8.66, 8.76, 8.87, 8.98, 9.09, 9.20, 9.31, 9.42, 9.53, 9.65, 9.76, 9.88], 0.005)

let E_SERIES = {
    "E3": e3,
    "E6": e6,
    "E12": e12,
    "E24": e24,
    "E48": e48,
    "E96": e96,
    "E192": e192,
};

function extend(s, a, b) {
    if (a < 0 || b < 0)
        throw "Ranges need to be positive";

    let mm = Math.floor(Math.log10(Math.min(a, b)));
    let mM = Math.floor(Math.log10(Math.max(a, b)));
    r = []
    for (let i = mm; i <= mM; i++) {
        let m = Math.pow(10, i);
        for (let e of s) {
            if (e.v * m >= Math.min(a, b) && e.v * m <= Math.max(a, b))
                r.push(e.mul(new GNum(m)));
        }
    }
    return r;
}

