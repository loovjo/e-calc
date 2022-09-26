"use strict";

let SI_SUFFICES = {
    'p': -12,
    'n': -9,
    'u': -6,
    'm': -3,
    'k': 3,
    'M': 6,
    'G': 9,
    'T': 12,
};

let TY_WHITESPACE = 'whitespace';
let TY_PAREN = 'paren';
let TY_OP = 'op'; // +-*/
let TY_PM = 'pm'; // +-, ±
let TY_VERT = 'vert'; // | (for abs)
let TY_MONO_COMP = 'monocomp'; // min, max, minabs, maxabs
let TY_BIN_COMP = 'bincomp'; // =, >, <
let TY_NUM = 'num';
let TY_DOT = 'dot';
let TY_VAR = 'var';
let TY_PERC = 'perc'; // percent

let TY_UNK = 'unk';
let TY_EOF = 'eof';

class Token {
    constructor(text, ty, startidx) {
        this.text = text;
        this.ty = ty;
        this.startidx = startidx;
    }
}

function tokenize(inp) {
    let tokens = [];

    let current_ty = undefined;
    let last_token_end = 0;
    let i = 0;
    for (let ch of inp) {
        let ch_ty = undefined;
        if (ch === ' ')
            ch_ty = TY_WHITESPACE;
        else if (ch === '(' || ch == ')')
            ch_ty = TY_PAREN;
        else if ('+-*/'.indexOf(ch) !== -1)
            ch_ty = TY_OP;
        else if (ch === '±')
            ch_ty = TY_PM;
        else if ('=<>'.indexOf(ch) !== -1)
            ch_ty = TY_BIN_COMP;
        else if (ch === '%')
            ch_ty = TY_PERC;
        else if (ch >= '0' && ch <= '9') {
            if (current_ty === TY_VAR)
                ch_ty = TY_VAR;
            else
                ch_ty = TY_NUM;
        } else if (ch == '.')
            ch_ty = TY_DOT;
        else if (ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z')
            ch_ty = TY_VAR;
        else
            ch_ty = TY_UNK;

        if (current_ty !== ch_ty || current_ty === TY_PM || current_ty === TY_OP || current_ty == TY_BIN_COMP || current_ty === TY_DOT || current_ty === TY_PAREN) {
            if (current_ty !== undefined) {
                let last_token_content = inp.substring(last_token_end, i);
                // check for +-
                if (current_ty == TY_OP && ch == '-' && last_token_content == '+') {
                    current_ty = TY_PM;
                    i++;
                    continue;
                }
                // check for min, max
                if (current_ty == TY_VAR && ['min', 'max', 'minabs', 'maxabs'].indexOf(last_token_content) !== -1) {
                    current_ty = TY_MONO_COMP;
                }
                tokens.push(new Token(inp.substring(last_token_end, i), current_ty, last_token_end));
            }
            last_token_end = i;
            current_ty = ch_ty;
        }
        i++;
    }
    tokens.push(new Token(inp.substring(last_token_end, i), current_ty, last_token_end));
    return tokens;
}

class Ast {
    // indexes into tokens array
    constructor(span_start, span_end) {
        this.span_start = span_start;
        this.span_end = span_end;
    }
    stringify() {}

    statementify() {}

    free_vars() {}
}

class AstExpression extends Ast {
    statementify() {
        return AstMonoComp(this.span_start, this.span_end, 'minabs', this);
    }

    // ctx = Map("name" → GNum)
    eval_ctx(ctx) {}
}

class AstNumber extends AstExpression {
    constructor(span_start, span_end, num) {
        super(span_start, span_end);
        this.num = num;
    }
    stringify() {
        return this.num.pretty();
    }
    eval_ctx(ctx) {
        return this.num;
    }
    free_vars() {
        return new Set();
    }
}

class AstVar extends AstExpression {
    constructor(span_start, span_end, name) {
        super(span_start, span_end);
        this.name = name;
    }
    stringify() {
        return this.name;
    }
    eval_ctx(ctx) {
        if (ctx.has(this.name))
            return ctx.get(this.name);
        else
            throw "Missing variable: " + expr.name;
    }
    free_vars() {
        return new Set([this.name]);
    }
}

class AstNegate extends AstExpression {
    constructor(span_start, span_end, inner) {
        super(span_start, span_end);
        this.inner = inner;
    }
    stringify() {
        return "-(" + this.inner.stringify() + ")";
    }
    eval_ctx(ctx) {
        return this.inner.eval_ctx(ctx).mul(new GNum(-1));
    }
    free_vars() {
        return this.inner.free_vars();
    }
}

class AstBinOp extends AstExpression {
    // op is string of op +-*/
    constructor(span_start, span_end, op, left, right) {
        super(span_start, span_end);
        this.op = op;
        this.left = left;
        this.right = right;
    }
    stringify() {
        return "(" + this.left.stringify() + ") " + this.op + " (" + this.right.stringify() + ")";
    }
    eval_ctx(ctx) {
        let v_left  = this.left.eval_ctx(ctx);
        let v_right = this.right.eval_ctx(ctx);
        if (this.op === '+')
            return v_left.add(v_right);
        else if (this.op === '-')
            return v_left.sub(v_right);
        else if (this.op === '*')
            return v_left.mul(v_right);
        else if (this.op === '/')
            return v_left.div(v_right);
        else
            throw "Unknown operation " + this.op;
    }
    free_vars() {
        let left_vars = this.left.free_vars();
        let right_vars = this.right.free_vars();
        return new Set([...left_vars, ...right_vars]);
    }
}

class AstStatement extends Ast {
    statementify() {
        return this;
    }

    // ctx = Map("name" → GNum)
    // low cost is better
    // returns {"cost": float, "info": Map("name" → GNum)}
    check_ctx(ctx) {}
}

class AstMonoComp extends AstStatement {
    // ty either min, max, minabs or maxabs
    constructor(span_start, span_end, ty, expr) {
        super(span_start, span_end);
        this.ty = ty;
        this.expr = expr;
    }
    stringify() {
        return this.ty + " " + this.expr.stringify();
    }
    free_vars() {
        return this.expr.free_vars();
    }
    check_ctx(ctx) {
        let value = this.expr.eval_ctx(ctx);
        let info = new Map();
        info.set("Value", value);

        // TODO: Penalize expressions with large uncertainty?
        // Maybe add half the uncertainty to the value?
        let cost;
        if (this.ty === 'min') {
            cost = value.v;
        } else if (this.ty === 'max') {
            cost = -value.v;
        } else if (this.ty === 'maxabs') {
            cost = new GNum(1).div(value).raw_second_moment();
        } else if (this.ty === 'minabs') {
            cost = value.raw_second_moment();
        } else {
            throw "Invalid monocomp operation " + this.ty;
        }
        return {"cost": cost, "info": info};
    }
}

class AstBinComp extends AstStatement {
    // ty either <, > or =
    constructor(span_start, span_end, ty, left, right) {
        super(span_start, span_end);
        this.ty = ty;
        this.left = left;
        this.right = right;
    }
    stringify() {
        return this.left.stringify() + " " + this.ty + " " + this.right.stringify();
    }
    free_vars() {
        let left_vars = this.left.free_vars();
        let right_vars = this.right.free_vars();
        return new Set([...left_vars, ...right_vars]);
    }

    check_ctx(ctx) {
        let value_left = this.left.eval_ctx(ctx);
        let value_right = this.right.eval_ctx(ctx);
        let info = new Map();
        info.set("LHS", value_left);
        info.set("RHS", value_right);

        let cost;
        if (this.ty === '=') {
            cost = value_left.sub(value_right).raw_second_moment();
        } else if (this.ty === '>') {
            cost = -value_left.sub(value_right).v;
        } else if (this.ty === '<') {
            cost = value_left.sub(value_right).v;
        } else {
            throw "Invalid binary comparison type " + this.ty;
        }
        return {"cost": cost, "info": info};
    }
}

class TokenStream {
    constructor(tokens, idx) {
        this.tokens = tokens;
        this.idx = idx;
        if (tokens == [])
            this.len = 0;
        else
            this.len = tokens[tokens.length-1].span_start + tokens[tokens.length-1].text.length;
    }

    skip_ws() {
        while (this.idx < this.tokens.length && this.tokens[this.idx].ty === TY_WHITESPACE)
            this.idx++;
    }
    peek() { if (this.idx >= this.tokens.length) return new Token('', TY_EOF, this.len); else return this.tokens[this.idx]; }
    pop() { if (this.idx >= this.tokens.length) return new Token('', TY_EOF, this.len); else return this.tokens[this.idx++]; }
}

let ts = new TokenStream(tokenize('Vref + (22.125 * R2 / R1) * -3.2'), 0)

/*
 * statement
 *    = expr ('=' | '<' | '>' | '==' | '<=' | '>=') expr
 *    | ('min' | 'max' | 'minabs' | 'maxabs') expr
 * expr = term (('+'|'-') term)*
 * term = factor (('*'|'/') factor)*
 * factor = '-' atom | atom
 * atom = var | gnum | '(' expr ')'
 * gnum = num | num '+-' num
 */

function parse_statement(ts) {
    if (ts.peek().ty === TY_MONO_COMP) {
        let monocomp = ts.pop();
        let expr = parse_expr(ts);

        return new AstMonoComp(ts.span_start, expr.span_end, monocomp.text, expr);
    } else {
        let expr_a = parse_expr(ts);
        if (ts.peek().ty !== TY_BIN_COMP) {
            return expr_a;
        } else {
            let bin_comp = ts.pop();
            let expr_b = parse_expr(ts);

            return new AstBinComp(expr_a.span_start, expr_b.span_end, bin_comp.text, expr_a, expr_b);
        }
    }
}

function parse_expr(ts) {
    ts.skip_ws();
    let val = parse_term(ts);
    while (true) {
        ts.skip_ws();
        let op = ts.peek();
        if (op.ty === TY_OP && (op.text === '+' || op.text === '-')) {
            op = ts.pop();
            let term = parse_term(ts);
            val = new AstBinOp(val.span_start, term.span_end, op.text, val, term);
        }
        else {
            return val;
        }
    }
}

function parse_term(ts) {
    ts.skip_ws();
    let val = parse_factor(ts);
    while (true) {
        ts.skip_ws();
        let op = ts.peek();
        if (op.ty == TY_OP && (op.text === '*' || op.text === '/')) {
            op = ts.pop();
            let factor = parse_factor(ts);
            val = new AstBinOp(val.span_start, factor.span_end, op.text, val, factor);
        }
        else {
            return val;
        }
    }
}

function parse_factor(ts) {
    ts.skip_ws();
    let negate = ts.peek();
    if (negate.ty === TY_OP && negate.text === '-') {
        let start = ts.idx;
        negate = ts.pop();

        let atom = parse_atom(ts);
        return new AstNegate(start, atom.span_end, atom);
    }

    return parse_atom(ts);
}

function parse_atom(ts) {
    ts.skip_ws();
    let init = ts.peek();
    if (init.ty === TY_PAREN && init.text === '(') {
        let start = ts.idx;
        let paren = ts.pop();
        let inner = parse_expr(ts);

        ts.skip_ws();
        let close_paren = ts.peek();
        if (close_paren.ty !== TY_PAREN || close_paren.text !== ')') {
            throw "Expected ')'";
        }
        close_paren = ts.pop();
        inner.span_start = start;
        inner.span_end = ts.idx;
        return inner;
    } else if (init.ty === TY_NUM || init.ty === TY_DOT) {
        let start = ts.idx;

        let [num, suffix_pow] = parse_num(ts);

        let m = new Map();

        ts.skip_ws();
        if (ts.peek().ty === TY_PM) {
            ts.pop();

            let [interval, interval_pow] = parse_num(ts);
            if (interval_pow === "%") {
                interval = interval / 100 * (num * Math.pow(10, suffix_pow || 0));
                interval_pow = 0;
            } else {
                if (interval_pow === undefined)
                    interval_pow = suffix_pow || 0;
                if (suffix_pow === undefined)
                    suffix_pow = interval_pow;
            }

            m.set(DV_STATIC, interval * Math.pow(10, interval_pow));
        }

        return new AstNumber(start, ts.idx, new GNum(num * Math.pow(10, suffix_pow || 0), m));
    } else if (init.ty == TY_VAR) {
        let name = ts.pop();
        return new AstVar(ts.idx - 1, ts.idx, name.text);
    } else {
        throw "Unexpected token " + init.text;
    }
}

// Returns [value, suffix_pow], representing the number value * 10**suffix_pow
// suffix_pow = undefined means no suffix was specified, should be treated as 0
// suffix_pow = % means suffix was %, only applicable for +-
function parse_num(ts) {
    ts.skip_ws();

    let int_part = ts.pop();
    let int_digits = int_part.text;
    let frac_digits = [];
    let suffix_pow = undefined;

    ts.skip_ws();
    let next = ts.peek();
    if (next.ty == TY_DOT) {
        let dot = ts.pop();

        ts.skip_ws();
        if (ts.peek().ty === TY_NUM)
            frac_digits = ts.pop().text;
    }

    let value = 0;
    for (let digit of int_digits) {
        value = 10 * value + '0123456789'.indexOf(digit);
    }
    for (let i = 0; i < frac_digits.length; i++) {
        value += '0123456789'.indexOf(frac_digits[i]) * Math.pow(10, -i - 1);
    }

    ts.skip_ws();
    if (ts.peek().ty == TY_VAR) {
        let suffix = ts.pop().text;
        if (SI_SUFFICES[suffix] !== undefined) {
            suffix_pow = SI_SUFFICES[suffix];
        } else if (suffix[0] === 'E' || suffix[0] === 'e') {
            if (suffix.length > 1) {
                suffix_pow = +suffix.substring(1);
                if (isNaN(suffix_pow))
                    throw "Expected number after exponent";
            } else {
                let negate = false;
                ts.skip_ws();
                if (ts.peek().ty === TY_OP) {
                    let op = ts.pop();
                    if (op.text === "-")
                        negate = true;
                    else if (op.text === "+") {
                        // pass
                    } else {
                        throw "Invalid operator after exponent. Expected +, - or none";
                    }
                }
                ts.skip_ws();
                let num = ts.pop();
                if (num.ty !== TY_NUM) {
                    throw "Expected number after exponent";
                }
                suffix_pow = +num.text;
                if (negate)
                    suffix_pow *= -1;
            }
        }
    } else if (ts.peek().ty == TY_PERC) {
        ts.pop();
        suffix_pow = "%";
    }

    return [value, suffix_pow];
}

function parse_string(str, token_dbg) {
    let tokens = tokenize(str);
    if (token_dbg !== undefined)
        token_dbg(tokens);

    let ts = new TokenStream(tokens, 0);

    let expr;
    try {
        expr = parse_statement(ts);
    } catch (e) {
        let tok_idx = ts.idx;

        let str_idx;
        if (ts.tok_idx < ts.tokens.length)
            str_idx = ts.tokens[tok_idx].startidx;
        else
            str_idx = str.length;
        throw {"msg": e, "offset": str_idx};
    }

    ts.skip_ws();
    if (ts.idx != ts.tokens.length) {
        let tok_idx = ts.idx;

        let str_idx = ts.tokens[tok_idx].startidx;
        throw {"msg": "Expected end", "offset": str_idx};
    }

    return expr;
}

