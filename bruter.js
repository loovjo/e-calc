class Bruter {
    constructor(
        statement,
        params_to_brute,
        time_per_step,
        progress_fn,
        done_fn,
    ) {
        this.statement = statement;
        this.params_to_brute = [...params_to_brute];
        this.time_per_step = time_per_step;

        if (progress_fn !== undefined)
            this.progress_fn = progress_fn;
        else
            this.progress_fn = _ => null;

        if (done_fn !== undefined)
            this.done_fn = done_fn;
        else
            this.done_fn = _ => null;

        this.param_values = this.params_to_brute.map(p => p.values());
        // used to do a lexicographic search of all values
        this.current_idxs = this.params_to_brute.map(p => 0);

        // TODO: Store in a heap sort or something to provide on-line ordering
        this.results = []; // [{"ctx": Map { name -> GNum }, "res": GNum}]

        this.n_steps = 0;
        this.total_steps = this.param_values.reduce((a, b) => a * b.length, 1);

        this.is_running = false;

        this.done = false;

        this._cancelled = false;
    }

    step_once() {
        if (this.done) {
            return;
        }

        let ctx = new Map();
        for (let i = 0; i < this.params_to_brute.length; i++) {
            let val = this.param_values[i][this.current_idxs[i]];
            ctx.set(this.params_to_brute[i].name, val);
        }
        let res = this.statement.check_ctx(ctx);

        if (res.cost !== undefined) {
            this.results.push({"ctx": ctx, "cost": res.cost, "info": res.info});
        }

        let i;
        for (i = this.params_to_brute.length - 1; i >= 0; i--) {
            this.current_idxs[i]++;
            if (this.current_idxs[i] == this.param_values[i].length) {
                this.current_idxs[i] = 0;
            } else {
                break;
            }
        }

        this.n_steps++;

        if (i === -1)
            this.done = true;
    }

    step_forever() {
        while (!this.done) {
            this.step_once();
        }
    }

    run() {
        this.is_running = true;
        if (this.done) {
            this.is_running = false;
            this.done_fn();
            return;
        }

        let end = +new Date() + this.time_per_step;
        while (true) {
            for (let i = 0; i < 1000; i++)
                this.step_once();

            if (+new Date() > end) {
                break;
            }
        }
        this.order_results();
        this.progress_fn(this.n_steps, this.total_steps);
        if (this._cancelled) {
            this.is_running = false;

            this._cancelled = false;
            return;
        }
        setTimeout(() => this.run(), 1);
    }

    cancel() {
        this._cancelled = true;
    }

    order_results() {
        // TODO: Might be faster to insert res into the proper position, or use a heap?
        this.results.sort(
            (a, b) => a["cost"] - b["cost"],
        )
    }
}
