let LINE_UP = "│";
let LINE_HORIZ = "─";
let LINE_CROSS = "┼";
let LINE_TURN_DOWN_RIGHT = "└";
let LINE_TURN_UP_UP_RIGHT = "├";
let LINE_TURN_RIGHT_RIGHT_UP = "┴";
let LINE_TURN_RIGHT_UP = "┘";
let LINE_TURN_RIGHT_DOWN = "┌";
let LINE_TURN_LEFT_DOWN = "┐";

// a + (b * 10 +- 2)
// | | || | |  |  ||
// \-+-++-+-+--+--++ var
//   \-++-+-+--+--++ op
//     \+-+-+--+--++ paren
//      \-+-+--+--++ var
//        \-+--+--++ op
// ...

function gen_tok_debug(text, tokens) {
    // skip whitespace
    tokens = tokens.filter(t => t.ty != TY_WHITESPACE);

    let tok_idxs = tokens.map(t => t.startidx);

    let first_line = "";
    for (let i = 0; i < text.length; i++) {
        let inside = tokens.filter(t => t.startidx <= i && t.startidx + t.text.length > i);
        if (inside.length != 1) {
            first_line += " ";
            continue;
        }
        let t = inside[0];

        if (i == t.startidx) {
            if (t.text.length == 1)
                first_line += LINE_UP;
            else
                first_line += LINE_TURN_UP_UP_RIGHT;
        } else {
            if (i == t.startidx + t.text.length - 1)
                first_line += LINE_TURN_RIGHT_UP;
            else
                first_line += LINE_HORIZ;
        }
    }

    let grid = "";
    for (let tokidx = 0; tokidx < tokens.length; tokidx++) {
        let tok = tokens[tokidx];
        let line = "";
        for (let i = 0; i < text.length; i++) {
            if (i < tok.startidx)
                line += " ";
            else if (i == tok.startidx)
                line += LINE_TURN_DOWN_RIGHT;
            else if (tok_idxs.indexOf(i) !== -1)
                line += LINE_CROSS;
            else
                line += LINE_HORIZ;
        }
        line += LINE_HORIZ + " " + tok.ty;
        grid += line + "\n";
    }
    return text + "\n" + first_line + "\n" + grid;
}

// Gives {"lines": [line...], "anchor_x": anchor_x}
// where anchor_x is where a parent should connect to
function gen_expr_debug(expr) {
    if (expr instanceof AstNumber || expr instanceof AstVar) {
        let strified = expr.stringify();
        return {"lines": [strified], "anchor_x": 0 | strified.length / 2};
    } else if (expr instanceof AstNegate || expr instanceof AstMonoComp) {
        let inner_expr, op;
        if (expr instanceof AstNegate) {
            inner_expr = expr.inner;
            op = '-';
        } else if (expr instanceof AstMonoComp) {
            inner_expr = expr.expr;
            op = expr.ty;
        }

        let inner = gen_expr_debug(inner_expr);
        let inner_lines = inner["lines"];
        let width = inner_lines[0].length;

        let anchor = inner["anchor_x"];

        if (anchor + op.length > width) {
            width = anchor + op.length;
            inner_lines = inner_lines.map(x => x + " ".repeat(width - x.length));
        }



        let top = " ".repeat(anchor) + op     + " ".repeat(width - anchor - op.length);
        let mid = " ".repeat(anchor) + LINE_UP + " ".repeat(width - anchor - 1);
        return {"lines": [top, mid, ...inner_lines], "anchor_x": anchor};
    } else if (expr instanceof AstBinOp || expr instanceof AstBinComp) {
        let left_expr, op, right_expr;

        if (expr instanceof AstBinOp) {
            left_expr = expr.left;
            right_expr = expr.right;
            op = expr.op;
        } else if (expr instanceof AstBinComp) {
            left_expr = expr.left;
            right_expr = expr.right;
            op = expr.ty;
        }

        let left = gen_expr_debug(left_expr);
        let left_lines = left["lines"];
        let left_anchor = left["anchor_x"];
        let left_width = left_lines[0].length;

        let margin_mid = 1;

        let right = gen_expr_debug(right_expr);
        let right_lines = right["lines"];
        let right_anchor = right["anchor_x"];
        let right_width = right_lines[0].length;

        // make both subboxes equally tall
        while (left_lines.length > right_lines.length) {
            right_lines.push(" ".repeat(right_width));
        }
        while (right_lines.length > left_lines.length) {
            left_lines.push(" ".repeat(left_width));
        }

        let bottom = [];
        for (let i = 0; i < left_lines.length; i++) {
            bottom.push(left_lines[i] + " ".repeat(margin_mid) + right_lines[i]);
        }

        let midpoint = 0 | (left_anchor + (left_width + margin_mid + right_anchor)) / 2;

        let top_line =
            " ".repeat(midpoint) +
            op +
            " ".repeat(left_width + margin_mid + right_width - midpoint - 1);

        let mid_line =
            " ".repeat(left_anchor) +
            LINE_TURN_RIGHT_DOWN +
            LINE_HORIZ.repeat(midpoint - left_anchor - 1) +
            LINE_TURN_RIGHT_RIGHT_UP +
            LINE_HORIZ.repeat(left_width + margin_mid + right_anchor - midpoint - 1) +
            LINE_TURN_LEFT_DOWN +
            " ".repeat(right_width - right_anchor - 1);

        return {"lines": [top_line, mid_line, ...bottom], "anchor_x": midpoint};
    }
}

class Parameter {
    constructor(
        name,
        outer_div,
        ty_select,

        limits_div,
        low_inp,
        high_inp,

        value_div,
        value_inp,

        n_values,
    ) {
        this.name = name;
        this.outer_div = outer_div;
        this.ty_select = ty_select;
        this.limits_div = limits_div;
        this.low_inp = low_inp;
        this.high_inp = high_inp;
        this.value_div = value_div;
        this.value_inp = value_inp;

        this.n_values = n_values;
    }

    get_ty() {
        return this.ty_select.value;
    }

    values() {
        if (this.get_ty() === "static") {
            let ts = new TokenStream(tokenize(this.value_inp.value), 0);
            let value;
            try {
                let expr = parse_expr(ts);
                // TODO: allow previously defined values here?
                value = expr.eval_ctx(new Map());
            } catch (e) {
                alert("Error: " + e); // TODO: Show error better
                return [];
            }
            value.set_uncertainty_in_var(this.name);
            return [value];
        } else {
            let series = E_SERIES[this.get_ty()];

            let low_ts = new TokenStream(tokenize(this.low_inp.value), 0);
            let low;
            try {
                let expr = parse_expr(low_ts);
                low = expr.eval_ctx(new Map());
            } catch (e) {
                alert("Error: " + e); // TODO: Show error better
                return [];
            }
            let high_ts = new TokenStream(tokenize(this.high_inp.value), 0);
            let high;
            try {
                let expr = parse_expr(high_ts);
                high = expr.eval_ctx(new Map());
            } catch (e) {
                alert("Error: " + e); // TODO: Show error better
                return [];
            }

            let ext = extend(series, low.v, high.v);
            return ext;
        }
    }

    update_display() {
        if (this.get_ty() === "static") {
            this.value_div.classList.remove("hidden");
            this.limits_div.classList.add("hidden");
        } else {
            this.limits_div.classList.remove("hidden");
            this.value_div.classList.add("hidden");
        }
        let values = this.values();
        console.log(values);
        this.n_values.innerText = values.length + " values";
    }
}

class ProgressBar {
    constructor(outer_div, inner_div, label) {
        this.outer_div = outer_div;
        this.inner_div = inner_div;
        this.label = label;
    }
    show() {
        this.outer_div.classList.remove("hidden");
    }
    hide() {
        this.outer_div.classList.add("hidden");
    }
    set_value(value, max) {
        this.inner_div.style = "width: " + (value / max * 100) + "%;";
        this.label.innerText = value + "/" + max + " = " + (value / max * 100) + "%";
    }
}

class App {
    constructor(
        expr_field,

        error_span,
        tok_debug,
        expr_debug,

        parameter_list,
        add_params_btn,
        remove_params_btn,

        go_button,

        results_div,

        progress_bar,
    ) {
        this.expr_field = expr_field;
        this.error_span = error_span;
        this.tok_debug = tok_debug;
        this.expr_debug = expr_debug;
        this.parameter_list = parameter_list;
        this.add_params_btn = add_params_btn;
        this.remove_params_btn = remove_params_btn;
        this.go_button = go_button;

        this.results_div = results_div;

        this.progress_bar = progress_bar;

        this.params = new Map();

        this.expr = undefined;

        self = this;
        this.add_params_btn.addEventListener("click", e => self.add_unset_params());
        this.remove_params_btn.addEventListener("click", e => self.remove_unused_params());
        this.go_button.addEventListener("click", e => this.run_brute());

        this.brute = undefined;
    }

    add_unset_params() {
        let to_add = this.params_to_change()["add"];
        for (let name of to_add) {
            if (this.params.get(name) !== undefined)
                continue;

            this.create_parameter(name);
        }
        this.update();
    }

    remove_unused_params() {
        let to_remove = this.params_to_change()["remove"];
        for (let name of to_remove) {
            let param = this.params.get(name);
            if (param === undefined)
                continue;

            this.params.delete(name);
            param.outer_div.remove();
        }

        this.update();
    }

    run_brute() {
        if (this.bruter !== undefined && this.bruter.is_running) {
            this.bruter.cancel();
        } else {
            let params_to_brute = [...this.params.values()];
            this.progress_bar.show();

            this.bruter = new Bruter(this.expr.statementify(), params_to_brute, 100,
                (a, b) => {
                    this.progress_bar.set_value(a, b);
                    this.update_brute_results();
                },
                () => {
                    this.progress_bar.hide();
                    this.update_brute_results();
                }
            );

            this.bruter.run();
        }
    }

    create_parameter(name) {
        let outer_div = document.createElement("div");
        outer_div.id = "param-" + name;
        outer_div.classList.add("parameter");
        this.parameter_list.appendChild(outer_div);

        let param_name = document.createElement("span");
        param_name.classList.add("param-name");
        param_name.innerText = name;
        outer_div.appendChild(param_name);

        let ty_select = document.createElement("select");
        outer_div.appendChild(ty_select);

        let custom = document.createElement("option");
        custom.value = "static";
        custom.innerText = "Static value";
        custom.selected = true;
        ty_select.appendChild(custom);

        for (let series_name in E_SERIES) {
            let option = document.createElement("option");
            option.value = option.innerText = series_name;
            ty_select.appendChild(option);
        }

        let limits_div = document.createElement("div");
        outer_div.appendChild(limits_div);

        let low_inp = document.createElement("input");
        low_inp.value = "1";
        limits_div.appendChild(low_inp);

        let high_inp = document.createElement("input");
        high_inp.value = "100";
        limits_div.appendChild(high_inp);

        let value_div = document.createElement("div");
        outer_div.appendChild(value_div);

        let value_inp = document.createElement("input");
        value_inp.type = "text";
        value_inp.value = "100m";
        value_div.appendChild(value_inp);

        let n_values = document.createElement("span");
        outer_div.appendChild(n_values);

        let param = new Parameter(
            name,
            outer_div,
            ty_select,
            limits_div,
            low_inp,
            high_inp,
            value_div,
            value_inp,
            n_values,
        );
        param.update_display();

        ty_select.addEventListener("change", e => param.update_display());
        low_inp.addEventListener("change", e => param.update_display());
        high_inp.addEventListener("change", e => param.update_display());
        value_inp.addEventListener("change", e => param.update_display());

        this.params.set(name, param);
    }

    params_to_change() {
        let vars = this.expr.free_vars();
        let to_add = new Set([...vars]);
        let to_remove = new Set([...this.params.keys()]);

        for (let v of vars) {
            to_remove.delete(v);
        }

        for (let v of this.params.keys()) {
            to_add.delete(v);
        }
        return {"add": to_add, "remove": to_remove};
    }

    update() {
        this.expr_debug.innerText = "";
        this.tok_debug.innerText = "";
        this.error_span.innerText = "";

        let text = this.expr_field.value;
        console.log(text);

        try {
            let self = this;
            this.expr = parse_string(text, t => {
                self.tok_debug.innerText = gen_tok_debug(text, t)
            });
        } catch (e) {
            if (e["msg"] === undefined)
                throw e;
            this.error_span.innerText = e["msg"];
            return;
        }

        this.expr_debug.innerText = this.expr.stringify() + "\n\n" + gen_expr_debug(this.expr)["lines"].join("\n");

        let change = this.params_to_change();
        let to_add = change["add"];
        let to_remove = change["remove"];

        if (to_add.size === 0) {
            this.add_params_btn.classList.add("hidden");
        } else {
            this.add_params_btn.classList.remove("hidden");
            this.add_params_btn.innerText = "Add " + [...to_add].join(", ");
        }

        if (to_remove.size === 0) {
            this.remove_params_btn.classList.add("hidden");
        } else {
            this.remove_params_btn.classList.remove("hidden");
            this.remove_params_btn.innerText = "Remove " + [...to_remove].join(", ");
        }
    }

    update_brute_results() {
        if (this.bruter === undefined) {
            this.results_div.classList.add("hidden");
            return;
        }

        if (this.bruter.is_running) {
            this.go_button.innerText = "Cancel";
        } else {
            this.go_button.innerText = "Run search";
        }


        this.results_div.classList.remove("hidden");
        this.results_div.innerHTML = "";

        for (let i = 0; i < Math.min(10, this.bruter.results.length); i++) {
            let res = this.bruter.results[i];
            let info = res["info"];
            let ctx = res["ctx"];

            let res_div = document.createElement("div");
            res_div.classList.add("result");
            this.results_div.appendChild(res_div);

            let infos = document.createElement("ul");
            infos.classList.add("info");
            res_div.appendChild(infos);

            for (let [name, value] of info) {
                let info_li = document.createElement("li");
                info_li.classList.add("info");
                infos.appendChild(info_li);

                info_li.innerText = name + " = " + value.pretty(true);
            }

            let vars = document.createElement("ul");
            vars.classList.add("vars");
            res_div.appendChild(vars);

            for (let [name, value] of ctx) {
                let var_li = document.createElement("li");
                var_li.classList.add("var");
                vars.appendChild(var_li);

                var_li.innerText = name + " = " + value.pretty(true);
            }
        }
    }
}

