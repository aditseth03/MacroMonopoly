// ui.js - browser front end. All rules live in game.js; this file only renders state and
// forwards clicks to the Game API.
(function () {
    'use strict';
    const MM = window.MM;
    const $ = (id) => document.getElementById(id);
    const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');
    const par = (x, d = 2) => (x < 0 ? `(${fmt(x, d)})` : fmt(x, d));          // factor in a product
    const sgn = (x, d = 2) => (x < 0 ? `− ${fmt(-x, d)}` : `+ ${fmt(x, d)}`);   // additive term
    const money = (x) => `$${Math.round(x).toLocaleString()}`;
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    let game = null;
    let botTimer = null;
    let logCursor = 0;
    const charts = {};

    // ---------- setup ----------
    function renderSeats() {
        const n = Math.max(2, Math.min(6, +$('num-players').value || 2));
        const list = $('seat-list');
        const prev = [...list.querySelectorAll('.seat')].map(el => ({
            name: el.querySelector('input').value, type: el.querySelector('select').value,
        }));
        list.innerHTML = '';
        for (let k = 0; k < n; k++) {
            const def = prev[k] || { name: `Player ${k + 1}`, type: k === 0 ? 'human' : ['macro', 'naive', 'leverage'][k % 3] };
            const row = document.createElement('div');
            row.className = 'seat';
            row.innerHTML = `<input type="text" value="${esc(def.name)}" aria-label="Seat ${k + 1} name">
                <select aria-label="Seat ${k + 1} controller">
                    <option value="human">Human</option>
                    <option value="naive">Bot: naive</option>
                    <option value="macro">Bot: macro-aware</option>
                    <option value="leverage">Bot: leveraged</option>
                </select>`;
            row.querySelector('select').value = def.type;
            list.appendChild(row);
        }
    }

    function startGame() {
        clearTimeout(botTimer);
        const seats = [...document.querySelectorAll('#seat-list .seat')].map(el => {
            const type = el.querySelector('select').value;
            return { name: el.querySelector('input').value.trim() || 'Player',
                type: type === 'human' ? 'human' : 'bot', strategy: type === 'human' ? null : type };
        });
        const seedVal = $('seed').value.trim();
        game = new MM.Game({
            players: seats,
            rounds: Math.max(8, +$('num-rounds').value || 40),
            policyMode: $('policy-mode').value,
            seed: seedVal === '' ? null : +seedVal,
            econ: { piStar: +$('inflation-target').value, phiPi: +$('phi-pi').value, phiY: +$('phi-y').value },
        });
        logCursor = 0;
        document.querySelector('#message-log .messages').innerHTML = '';
        $('setup').classList.add('collapsed');
        renderAll();
        scheduleBots();
    }

    // ---------- board ----------
    function boardPosition(i) {
        if (i <= 10) return { row: 11, col: 11 - i };
        if (i <= 20) return { row: 11 - (i - 10), col: 1 };
        if (i <= 30) return { row: 1, col: 1 + (i - 20) };
        return { row: 1 + (i - 30), col: 11 };
    }

    function renderBoard() {
        const board = $('game-board');
        const squares = game ? game.squares : MM.SQUARES.map((s, id) => Object.assign({ id, value: s.price, houses: 0, owner: null }, s));
        board.innerHTML = '';
        squares.forEach(sq => {
            const el = document.createElement('div');
            const pos = boardPosition(sq.id);
            el.className = `board-square ${sq.type} ${sq.id % 10 === 0 ? 'corner' : ''} side-${Math.floor(sq.id / 10)}`;
            el.style.gridRow = pos.row;
            el.style.gridColumn = pos.col;
            el.dataset.id = sq.id;
            if (game && sq.owner !== null) {
                el.style.boxShadow = `inset 0 0 0 3px ${game.players[sq.owner].color}`;
            }
            const color = sq.type === 'property' ? `<div class="property-color g-${sq.group}"></div>` : '';
            const houses = sq.houses ? `<div class="houses">${sq.houses === 5 ? '<span class="hotel">H</span>' : '<span class="house"></span>'.repeat(sq.houses)}</div>` : '';
            const loan = sq.loan ? `<span class="loan-badge" title="${sq.loan.kind} loan">${sq.loan.kind === 'fixed' ? 'FIX' : 'FLT'}</span>` : '';
            el.innerHTML = `${color}${houses}<div class="name">${esc(sq.name)}</div>
                ${sq.price ? `<div class="price">${money(sq.value)}${loan}</div>` : ''}
                <div class="token-container"></div>`;
            el.addEventListener('click', () => showProperty(sq.id));
            board.appendChild(el);
        });
        if (game) game.players.filter(p => !p.bankrupt).forEach(p => {
            const t = document.createElement('div');
            t.className = 'player-token' + (p.id === game.current ? ' active' : '');
            t.style.background = p.color;
            t.title = p.name;
            board.querySelector(`[data-id="${p.position}"] .token-container`).appendChild(t);
        });
    }

    // ---------- centre: ticker, prompt and actions ----------
    function renderCentre() {
        if (!game) return;
        const e = game.economy;
        $('quarter-label').textContent = game.phase === 'over'
            ? `Game over after ${game.round} quarters`
            : `Quarter ${game.round + 1} of ${game.s.rounds}`;
        $('ticker').innerHTML = `
            <span>π <b>${fmt(e.pi)}%</b></span><span>i <b>${fmt(e.i)}%</b></span>
            <span>gap <b>${fmt(e.y)}%</b></span><span>prices ×<b>${fmt(e.priceLevel, 3)}</b></span>`;
        $('dice-1').textContent = game.dice[0];
        $('dice-2').textContent = game.dice[1];

        const p = game.player;
        const human = p.type === 'human';
        const policyHuman = game.phase === 'policy' && game.players[game.chair].type === 'human';
        let prompt = '';
        if (game.phase === 'over') prompt = `${esc(game.players[game.winner].name)} wins!`;
        else if (game.phase === 'policy') prompt = `${esc(game.players[game.chair].name)} is setting the policy rate…`;
        else if (!human) prompt = `${esc(p.name)} (bot) is thinking…`;
        else if (game.phase === 'buy') {
            const sq = game.squares[game.pendingBuy];
            prompt = `${esc(p.name)}: buy ${esc(sq.name)} for ${money(sq.value)}?`;
        } else if (game.phase === 'roll') prompt = p.inJail ? `${esc(p.name)} is in Jail: roll for doubles or pay bail.` : `${esc(p.name)}, roll the dice.`;
        else prompt = game.rolledDoubles ? `${esc(p.name)} rolled doubles: end turn to roll again.` : `${esc(p.name)}: manage assets or end your turn.`;
        $('turn-prompt').innerHTML = prompt;

        const show = (id, on, enabled = true) => {
            $(id).hidden = !on;
            $(id).disabled = !enabled;
        };
        const can = human && game.phase !== 'over' && game.phase !== 'policy';
        show('btn-roll', can && game.phase === 'roll');
        show('btn-bail', can && game.phase === 'roll' && p.inJail, p.jailCards > 0 || p.cash >= game.bailCost());
        $('btn-bail').textContent = p.jailCards > 0 ? 'Use jail card' : `Pay bail (${money(game.bailCost())})`;
        show('btn-buy', can && game.phase === 'buy');
        show('btn-pass', can && game.phase === 'buy');
        show('btn-manage', can && (game.phase === 'roll' || game.phase === 'post'));
        show('btn-end', can && game.phase === 'post');
        if (policyHuman && !$('modal').classList.contains('open')) showPolicy();
        if (game.phase === 'over' && !game._overShown) { game._overShown = true; showGameOver(); }
    }

    // ---------- side panels ----------
    function renderPlayers() {
        const el = $('player-panels');
        if (!game) { el.innerHTML = ''; return; }
        el.innerHTML = '<h2>Players</h2>' + game.players.map(p => {
            const props = game.ownedBy(p.id);
            const chips = props.map(sq => `<span class="chip g-${sq.group}" title="${esc(sq.name)}${sq.loan ? ' (' + sq.loan.kind + ' loan)' : ''}">${sq.houses ? (sq.houses === 5 ? 'H' : sq.houses) : ''}${sq.loan ? '•' : ''}</span>`).join('');
            return `<div class="player-panel ${p.id === game.current && game.phase !== 'over' ? 'active' : ''} ${p.bankrupt ? 'bankrupt' : ''}">
                <h3><span class="player-token-icon" style="background:${p.color}"></span>${esc(p.name)}
                    <span class="muted">${p.type === 'human' ? '' : 'bot · ' + p.strategy}${p.inJail ? ' · in jail' : ''}${p.bankrupt ? ' · bankrupt' : ''}</span></h3>
                <div class="pstats">
                    <span>Cash <b>${money(p.cash)}</b></span>
                    <span>Debt <b>${money(game.debtOf(p.id))}</b></span>
                    <span>Net worth <b>${money(game.netWorth(p.id))}</b></span>
                    <span>Real net worth <b>${money(game.realNetWorth(p.id))}</b></span>
                </div>
                <div class="chips">${chips}</div>
            </div>`;
        }).join('');
    }

    function renderTiles() {
        if (!game) return;
        const e = game.economy;
        const tiles = [
            ['Inflation', `${fmt(e.pi)}%`, `target ${fmt(e.p.piStar, 1)}%`],
            ['Policy rate', `${fmt(e.i)}%`, `long rate ${fmt(e.iL)}%`],
            ['Output gap', `${fmt(e.y)}%`, e.y >= 0 ? 'above potential' : 'below potential'],
            ['Real long rate', `${fmt(e.realLongRate())}%`, 'drives property values'],
            ['Floating loans', `${fmt(e.floatingLoanRate())}%`, `fixed now ${fmt(e.fixedLoanRate())}%`],
            ['Credit spread', `${fmt(e.spread)}pp`, e.spread > 0.5 ? 'credit is tight' : 'normal'],
            ['Credibility', `${Math.round(e.cred * 100)}%`, 'weight on target in expectations'],
            ['Price level', `×${fmt(e.priceLevel, 3)}`, `GO pays ${money(game.nominal(200))}`],
        ];
        $('tiles').innerHTML = tiles.map(([k, v, s]) =>
            `<div class="tile"><div class="tile-k">${k}</div><div class="tile-v">${v}</div><div class="tile-s">${s}</div></div>`).join('');
    }

    function renderEquations() {
        const c = game && game.economy.lastCalc;
        if (!c) { $('equations-content').innerHTML = '<p class="muted">Finish a quarter to see the calculations.</p>'; return; }
        const p = game.economy.p;
        $('equations-content').innerHTML = `
            <p class="muted">Last quarter, step by step. All rates are annualised percent; one round is one quarter.</p>
            <div class="equation"><div class="equation-title">Expectations</div>
                <div class="equation-formula">πᵉ = c·π* + (1 − c)·π₋₁</div>
                <div class="equation-calc">${fmt(c.pe)} = ${fmt(game.economy.history.at(-2).cred)}·${fmt(p.piStar)} + (1 − ${fmt(game.economy.history.at(-2).cred)})·${fmt(c.prev.pi)}</div></div>
            <div class="equation"><div class="equation-title">IS curve (output gap)</div>
                <div class="equation-formula">y = ρ_y·y₋₁ − σ·(i₋₁ − πᵉ − r*) − σ_f·s + demand shocks + player impulse + ε</div>
                <div class="equation-calc">${fmt(c.y)} = ${p.rhoY}·${par(c.prev.y)} − ${p.sigma}·(${fmt(c.prev.i)} − ${fmt(c.pe)} − ${p.rStar}) − ${p.sigmaF}·${par(c.spread)} ${sgn(c.d)} ${sgn(c.impulse)} ${sgn(c.eY)}</div></div>
            <div class="equation"><div class="equation-title">Phillips curve (inflation)</div>
                <div class="equation-formula">π = πᵉ + κ·y + supply shocks + ε</div>
                <div class="equation-calc">${fmt(c.pi)} = ${fmt(c.pe)} + ${p.kappa}·${par(c.y)} ${sgn(c.u)} ${sgn(c.ePi)}</div></div>
            <div class="equation"><div class="equation-title">Taylor rule (policy rate, with smoothing and the zero lower bound)</div>
                <div class="equation-formula">i = max(0, ρ_i·i₋₁ + (1 − ρ_i)·[r* + π + φ_π(π − π*) + φ_y·y])</div>
                <div class="equation-calc">${fmt(c.taylor)} = max(0, ${p.rhoI}·${fmt(c.prev.i)} + ${fmt(1 - p.rhoI)}·[${p.rStar} + ${fmt(c.pi)} + ${p.phiPi}·${par(c.pi - p.piStar)} + ${p.phiY}·${par(c.y)}])</div>
                ${c.overridden ? `<div class="equation-calc warn">Fed Chair set ${fmt(c.i)}% instead.</div>` : ''}</div>
            <div class="equation"><div class="equation-title">Property values</div>
                <div class="equation-formula">value = printed price × price level × (r* + premium) / (real long rate + premium + ½·spread)</div>
                <div class="equation-calc">real long rate ${fmt(game.economy.realLongRate())}%: brown ×${fmt(game.valueMultiplier('brown'))}, dark blue ×${fmt(game.valueMultiplier('dark-blue'))}</div></div>`;
    }

    // ---------- charts ----------
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    function baseOptions(yLabel) {
        return {
            animation: false, responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { labels: { color: css('--ink-2'), boxWidth: 12 } } },
            scales: {
                x: { ticks: { color: css('--ink-3') }, grid: { color: css('--grid') } },
                y: { ticks: { color: css('--ink-3') }, grid: { color: css('--grid') }, title: { display: !!yLabel, text: yLabel, color: css('--ink-3') } },
            },
        };
    }
    function initCharts() {
        if (typeof Chart === 'undefined') return;
        const line = (label, color, extra = {}) => Object.assign({ label, data: [], borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 2, tension: 0.25 }, extra);
        charts.fan = new Chart($('fan-chart'), { type: 'line', data: { labels: [], datasets: [
            line('Inflation 10%', 'transparent', { borderWidth: 0 }),
            line('Inflation band', 'transparent', { borderWidth: 0, fill: '-1', backgroundColor: css('--s1-band') }),
            line('Inflation', css('--s1')),
            line('Policy rate 10%', 'transparent', { borderWidth: 0 }),
            line('Policy rate band', 'transparent', { borderWidth: 0, fill: '-1', backgroundColor: css('--s2-band') }),
            line('Policy rate', css('--s2')),
        ] }, options: Object.assign(baseOptions('% (annualised)'), {
            plugins: { legend: { labels: { color: css('--ink-2'), boxWidth: 12, filter: i => !/10%|band/.test(i.text) } } },
        }) });
        charts.rates = new Chart($('rates-chart'), { type: 'line', data: { labels: [], datasets: [
            line('Inflation', css('--s1')), line('Policy rate', css('--s2')),
            line('Long rate', css('--s3'), { borderDash: [5, 4] }),
            line('Target', css('--ink-3'), { borderWidth: 1, borderDash: [2, 3] }),
        ] }, options: baseOptions('%') });
        charts.cred = new Chart($('cred-chart'), { type: 'line', data: { labels: [], datasets: [
            line('Central-bank credibility', css('--s4')),
        ] }, options: Object.assign(baseOptions('%'), { scales: Object.assign(baseOptions().scales, { y: Object.assign(baseOptions().scales.y, { min: 0, max: 100 }) }) }) });
        charts.output = new Chart($('output-chart'), { data: { labels: [], datasets: [
            Object.assign(line('Output gap', css('--s3')), { type: 'line' }),
            { type: 'bar', label: 'Player impulse', data: [], backgroundColor: css('--s2-band') },
        ] }, options: baseOptions('% of potential') });
    }

    function renderCharts() {
        if (!game || !charts.fan) return;
        const h = game.economy.history;
        const labels = h.map(x => `Q${x.round}`);
        charts.rates.data.labels = labels;
        charts.rates.data.datasets[0].data = h.map(x => x.pi);
        charts.rates.data.datasets[1].data = h.map(x => x.i);
        charts.rates.data.datasets[2].data = h.map(x => x.iL);
        charts.rates.data.datasets[3].data = h.map(() => game.economy.p.piStar);
        charts.rates.update();
        charts.cred.data.labels = labels;
        charts.cred.data.datasets[0].data = h.map(x => x.cred * 100);
        charts.cred.update();
        charts.output.data.labels = labels;
        charts.output.data.datasets[0].data = h.map(x => x.y);
        charts.output.data.datasets[1].data = h.map(x => x.impulse);
        charts.output.update();

        // fan: last 8 quarters of history, then 8 quarters of forecast
        if (charts.fanRound !== game.economy.round) {
            charts.fanRound = game.economy.round;
            const fc = game.economy.forecast(8, 300);
            const past = h.slice(-8);
            const n = past.length;
            const pad = (arr) => Array(n - 1).fill(null).concat(arr);
            const last = past[n - 1];
            charts.fan.data.labels = past.map(x => `Q${x.round}`).concat(fc.pi.map((_, k) => `Q${last.round + k + 1}`));
            const ds = charts.fan.data.datasets;
            ds[0].data = pad([last.pi, ...fc.pi.map(x => x.p10)]);
            ds[1].data = pad([last.pi, ...fc.pi.map(x => x.p90)]);
            ds[2].data = past.map(x => x.pi).concat(fc.pi.map(x => x.p50));
            ds[3].data = pad([last.i, ...fc.i.map(x => x.p10)]);
            ds[4].data = pad([last.i, ...fc.i.map(x => x.p90)]);
            ds[5].data = past.map(x => x.i).concat(fc.i.map(x => x.p50));
            charts.fan.update();
        }
    }

    function renderLog() {
        if (!game) return;
        const box = document.querySelector('#message-log .messages');
        for (; logCursor < game.log.length; logCursor++) {
            const m = game.log[logCursor];
            const p = document.createElement('p');
            p.textContent = m.msg;
            if (m.cls) p.className = m.cls;
            box.appendChild(p);
        }
        while (box.children.length > 400) box.removeChild(box.firstChild);
        box.scrollTop = box.scrollHeight;
    }

    function renderAll() {
        renderBoard();
        renderCentre();
        renderPlayers();
        renderTiles();
        renderEquations();
        renderCharts();
        renderLog();
    }

    // ---------- modals ----------
    function openModal(html) {
        $('modal-body').innerHTML = html;
        $('modal').classList.add('open');
        $('modal').setAttribute('aria-hidden', 'false');
    }
    function closeModal() {
        $('modal').classList.remove('open');
        $('modal').setAttribute('aria-hidden', 'true');
        if (game && game.phase === 'policy' && game.players[game.chair].type === 'human') {
            setTimeout(renderCentre, 0); // the chair must still decide; reopen
        }
    }

    function showProperty(id) {
        const sq = game ? game.squares[id] : Object.assign({ value: MM.SQUARES[id].price, houses: 0, owner: null }, MM.SQUARES[id]);
        if (!sq.price) return;
        const g = MM.GROUPS[sq.group];
        const pl = game ? game.pl : 1;
        let rents = '';
        if (sq.type === 'property') {
            const labels = ['Site', '1 house', '2 houses', '3 houses', '4 houses', 'Hotel'];
            rents = `<table class="mini">${sq.rents.map((r, k) => `<tr class="${k === sq.houses ? 'hl' : ''}"><td>${labels[k]}</td><td>${money(r * pl)}</td></tr>`).join('')}</table>
                <p>House cost: ${money(g.houseCost * pl)}</p>`;
        } else if (sq.type === 'railroad') rents = `<p>Rent: ${[25, 50, 100, 200].map(r => money(r * pl)).join(' / ')} for 1–4 railroads.</p>`;
        else rents = `<p>Rent: 4× dice (one utility) or 10× dice (both), indexed to prices.</p>`;
        const mult = game ? game.valueMultiplier(sq.group) : 1;
        const loan = sq.loan ? `<p>Loan: ${money(sq.loan.principal)} ${sq.loan.kind}${sq.loan.kind === 'fixed' ? ' at ' + fmt(sq.loan.rate) + '%' : ' (now ' + fmt(game.loanRate(sq.loan)) + '%)'}</p>` : '';
        openModal(`<h3>${esc(sq.name)}</h3>
            <p>Value: <b>${money(sq.value)}</b> <span class="muted">(printed ${money(sq.price)}; ×${fmt(mult)} from real rates, ×${fmt(pl, 3)} price level)</span></p>
            <p>Group risk premium: ${g.premium}% <span class="muted">(lower premium = more rate-sensitive)</span></p>
            ${rents}
            <p>Owner: ${sq.owner === null ? 'Bank' : esc(game.players[sq.owner].name)}</p>${loan}`);
    }

    function showManage() {
        const p = game.player;
        const rows = game.ownedBy(p.id).map(sq => {
            const btn = (label, act, enabled, cls = '') => `<button data-act="${act}" data-id="${sq.id}" ${enabled ? '' : 'disabled'} class="${cls}">${label}</button>`;
            const loanTxt = sq.loan
                ? `${sq.loan.kind} ${money(sq.loan.principal)} @ ${fmt(game.loanRate(sq.loan))}%`
                : `can borrow ${money(game.loanAmount(sq))}`;
            return `<div class="property-item">
                <span class="property-name"><span class="chip g-${sq.group}"></span>${esc(sq.name)}
                    <span class="muted">${sq.houses ? (sq.houses === 5 ? 'hotel' : sq.houses + ' house' + (sq.houses > 1 ? 's' : '')) + ' · ' : ''}${loanTxt}</span></span>
                <span class="btns">
                    ${sq.type === 'property' ? btn(`Build ${money(game.houseCost(sq))}`, 'build', game.canBuild(p.id, sq)) : ''}
                    ${sq.type === 'property' ? btn('Sell bldg', 'sell', game.canSellHouse(p.id, sq)) : ''}
                    ${sq.loan ? btn(`Repay ${money(sq.loan.principal)}`, 'repay', game.canRepay(p.id, sq))
                        : btn('Borrow fixed', 'fixed', game.canBorrow(p.id, sq)) + btn('Borrow floating', 'floating', game.canBorrow(p.id, sq))}
                </span></div>`;
        }).join('');
        const e = game.economy;
        openModal(`<h3>Manage assets: ${esc(p.name)} <span class="muted">cash ${money(p.cash)}</span></h3>
            <p class="muted">Loans: ${Math.round(game.s.loanToValue * 100)}% of current value. Fixed locks ${fmt(e.fixedLoanRate())}% for the life of the loan;
            floating pays the policy rate + 2% + credit spread, now ${fmt(e.floatingLoanRate())}%. Interest is charged every quarter, and cash earns the policy rate (${fmt(e.i)}%).
            Mortgaged lots keep earning rent.</p>
            ${rows || '<p>You do not own any property yet.</p>'}`);
        $('modal-body').querySelectorAll('button[data-act]').forEach(b => b.addEventListener('click', () => {
            const id = +b.dataset.id, act = b.dataset.act;
            if (act === 'build') game.build(p.id, id);
            else if (act === 'sell') game.sellHouse(p.id, id);
            else if (act === 'repay') game.repay(p.id, id);
            else game.borrow(p.id, id, act);
            renderAll();
            showManage();
        }));
    }

    function showPolicy() {
        const e = game.economy, c = e.pending, chair = game.players[game.chair];
        const rec = game.taylorRecommendation;
        const debt = game.ownedBy(chair.id).filter(sq => sq.loan && sq.loan.kind === 'floating').reduce((s, sq) => s + sq.loan.principal, 0);
        openModal(`<h3>${esc(chair.name)}, you chair the central bank this quarter</h3>
            <p>This quarter: inflation <b>${fmt(c.pi)}%</b> (target ${fmt(e.p.piStar, 1)}%), output gap <b>${fmt(c.y)}%</b>, last rate ${fmt(e.i)}%.</p>
            <p>The Taylor rule recommends <b>${fmt(rec)}%</b>. Every point you deviate costs credibility, which de-anchors expectations and makes inflation harder to control later.</p>
            ${debt ? `<p class="warn">Conflict of interest: you owe ${money(debt)} in floating-rate loans.</p>` : ''}
            <label class="slider">Policy rate: <b id="rate-out">${fmt(rec)}%</b>
                <input type="range" id="rate-in" min="0" max="${Math.max(12, Math.ceil(rec + 4))}" step="0.25" value="${(Math.round(rec * 4) / 4).toFixed(2)}"></label>
            <div class="btns"><button id="rate-rule">Follow the rule</button><button id="rate-set" class="primary">Set rate</button></div>`);
        const input = $('rate-in');
        input.addEventListener('input', () => { $('rate-out').textContent = `${(+input.value).toFixed(2)}%`; });
        $('rate-rule').addEventListener('click', () => { game.setPolicy(null); afterPolicy(); });
        $('rate-set').addEventListener('click', () => { game.setPolicy(+input.value); afterPolicy(); });
    }
    function afterPolicy() {
        $('modal').classList.remove('open');
        renderAll();
        scheduleBots();
    }

    function showGameOver() {
        openModal(`<h3>Game over</h3><p>Ranked by real net worth (deflated by the price level ×${fmt(game.pl, 3)}):</p>
            <table class="mini">${game.ranking.map((r, k) => `<tr><td>${k + 1}. ${esc(r.name)}</td><td>${money(r.real)}</td></tr>`).join('')}</table>`);
    }

    // ---------- bots ----------
    function scheduleBots() {
        clearTimeout(botTimer);
        if (!game || game.phase === 'over') return;
        const delay = +$('bot-speed').value;
        const step = () => {
            let acted = false, n = 0;
            do { acted = MM.act(game); n++; } while (acted && delay === 0 && n < 5000 && game.phase !== 'over');
            renderAll();
            if (acted && game.phase !== 'over') botTimer = setTimeout(step, delay);
        };
        botTimer = setTimeout(step, delay);
    }

    function humanAction(fn) {
        if (!game) return;
        fn();
        renderAll();
        scheduleBots();
    }

    // ---------- simulation tab ----------
    function runSimulation() {
        const seats = $('sim-seats').value.split(',').map(s => s.trim()).filter(Boolean);
        const bad = seats.filter(s => !MM.BOT_NAMES.includes(s));
        const out = $('simulation-results');
        if (seats.length < 2 || seats.length > 6 || bad.length) {
            out.innerHTML = `<p class="warn">Use 2–6 seats from: ${MM.BOT_NAMES.join(', ')}.</p>`;
            return;
        }
        const games = Math.max(1, Math.min(2000, +$('sim-games').value || 100));
        const rounds = Math.max(8, +$('sim-rounds').value || 40);
        out.innerHTML = '<p>Running…</p>';
        $('run-simulation').disabled = true;
        // run in chunks so the page stays responsive, then merge
        const chunk = 10, parts = [];
        let done = 0;
        const next = () => {
            const n = Math.min(chunk, games - done);
            parts.push(MM.tournament({ strategies: seats, games: n, rounds, seed: 1 + done }));
            done += n;
            out.innerHTML = `<p>Running… ${done}/${games}</p>`;
            if (done < games) return setTimeout(next, 0);
            $('run-simulation').disabled = false;
            renderSimResults(parts, games, rounds, seats);
        };
        setTimeout(next, 0);
    }
    function renderSimResults(parts, games, rounds, seats) {
        const w = (k) => parts.reduce((s, p) => s + p[k], 0);
        const stratRows = parts[0].byStrategy.map(s0 => {
            const all = parts.map(p => p.byStrategy.find(s => s.strategy === s0.strategy));
            const avg = (k) => all.reduce((s, x, i) => s + x[k] * parts[i].games, 0) / games;
            return `<tr><td>${s0.strategy}</td><td>${s0.seats}</td><td>${(100 * avg('winRate')).toFixed(1)}%</td><td>${(100 * s0.fairShare).toFixed(0)}%</td>
                <td>${money(avg('meanRealNetWorth'))}</td><td>${(100 * avg('bankruptRate')).toFixed(1)}%</td></tr>`;
        }).join('');
        const m = (k) => parts.reduce((s, p) => s + p.macro[k] * p.games, 0) / w('games');
        $('simulation-results').innerHTML = `<h3>${games} games × ${rounds} quarters</h3>
            <table class="mini"><tr><th>Strategy</th><th>Seats</th><th>Win rate</th><th>Fair share</th><th>Mean real NW</th><th>Bankrupt</th></tr>${stratRows}</table>
            <p class="muted">Macro: mean inflation ${fmt(m('meanPi'))}% (sd ${fmt(m('sdPi'))}), mean policy rate ${fmt(m('meanI'))}%,
            output-gap sd ${fmt(m('sdY'))}, zero-lower-bound share ${(100 * m('zlbShare')).toFixed(1)}%.</p>`;
    }

    // ---------- wiring ----------
    document.addEventListener('DOMContentLoaded', () => {
        renderSeats();
        renderBoard();
        initCharts();
        $('num-players').addEventListener('input', renderSeats);
        $('start-game').addEventListener('click', startGame);
        $('btn-roll').addEventListener('click', () => humanAction(() => game.roll()));
        $('btn-bail').addEventListener('click', () => humanAction(() => game.payBail()));
        $('btn-buy').addEventListener('click', () => humanAction(() => game.buy()));
        $('btn-pass').addEventListener('click', () => humanAction(() => game.pass()));
        $('btn-end').addEventListener('click', () => humanAction(() => game.endTurn()));
        $('btn-manage').addEventListener('click', () => game && showManage());
        $('run-simulation').addEventListener('click', runSimulation);
        $('setup').querySelector('h2').addEventListener('click', () => $('setup').classList.toggle('collapsed'));
        document.querySelector('#modal .close').addEventListener('click', closeModal);
        $('modal').addEventListener('click', (ev) => { if (ev.target === $('modal')) closeModal(); });
        document.querySelectorAll('.tab-link').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('.tab-link').forEach(x => x.classList.toggle('active', x === b));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === b.dataset.tab));
            Object.values(charts).forEach(c => c && c.resize && c.resize());
        }));
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            Object.keys(charts).forEach(k => { if (charts[k] && charts[k].destroy) charts[k].destroy(); delete charts[k]; });
            initCharts();
            renderCharts();
        });
        window.MMUI = { get game() { return game; }, render: renderAll }; // handy for debugging in the console
    });
})();
