// board.js - static board, rent tables and card decks. Dollar amounts are in
// round-0 dollars; the game multiplies them by the price level when they are used.
(function (root) {
    'use strict';

    // Classic Monopoly rent tables: [site, 1 house, 2, 3, 4, hotel].
    // `premium` is the group's risk premium in the cap rate: cheap groups are high-yield and
    // barely rate-sensitive; the expensive groups are low-yield, long-duration assets.
    const GROUPS = {
        'brown':      { houseCost: 50,  premium: 8.0, label: 'Brown' },
        'light-blue': { houseCost: 50,  premium: 7.0, label: 'Light blue' },
        'pink':       { houseCost: 100, premium: 6.0, label: 'Pink' },
        'orange':     { houseCost: 100, premium: 5.5, label: 'Orange' },
        'red':        { houseCost: 150, premium: 5.0, label: 'Red' },
        'yellow':     { houseCost: 150, premium: 4.5, label: 'Yellow' },
        'green':      { houseCost: 200, premium: 4.0, label: 'Green' },
        'dark-blue':  { houseCost: 200, premium: 3.5, label: 'Dark blue' },
        'railroad':   { houseCost: 0,   premium: 6.0, label: 'Railroads' },
        'utility':    { houseCost: 0,   premium: 7.0, label: 'Utilities' },
    };

    const P = (name, group, price, rents) => ({ name, type: 'property', group, price, rents });
    const R = (name) => ({ name, type: 'railroad', group: 'railroad', price: 200, rents: [25, 50, 100, 200] });
    const U = (name) => ({ name, type: 'utility', group: 'utility', price: 150 });

    const SQUARES = [
        { name: 'GO', type: 'go' },
        P('Friedman Ave', 'brown', 60, [2, 10, 30, 90, 160, 250]),
        { name: 'Community Treasury', type: 'community' },
        P('Blanchard Ave', 'brown', 60, [4, 20, 60, 180, 320, 450]),
        { name: 'Income Tax', type: 'tax', amount: 200 },
        R('Mankiw Railroad'),
        P('Prescott Ave', 'light-blue', 100, [6, 30, 90, 270, 400, 550]),
        { name: 'Exogenous Shock!', type: 'shock' },
        P('Diamond Plaza', 'light-blue', 100, [6, 30, 90, 270, 400, 550]),
        P('Greenspan Ave', 'light-blue', 120, [8, 40, 100, 300, 450, 600]),
        { name: 'Jail', type: 'jail' },
        P('St. Acemoglu Place', 'pink', 140, [10, 50, 150, 450, 625, 750]),
        U('Electric Company'),
        P('Samuelson Ave', 'pink', 140, [10, 50, 150, 450, 625, 750]),
        P('Volcker Ave', 'pink', 160, [12, 60, 180, 500, 700, 900]),
        R('Phillips Railroad'),
        P('Taylor Place', 'orange', 180, [14, 70, 200, 550, 750, 950]),
        { name: 'Community Treasury', type: 'community' },
        P('Dixit Place', 'orange', 180, [14, 70, 200, 550, 750, 950]),
        P('Stiglitz Ave', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
        { name: 'Suboptimal Free Parking', type: 'parking' },
        P('Lucas St.', 'red', 220, [18, 90, 250, 700, 875, 1050]),
        { name: 'Exogenous Shock!', type: 'shock' },
        P('Krugman Institute', 'red', 220, [18, 90, 250, 700, 875, 1050]),
        P('Sargent Ave', 'red', 240, [20, 100, 300, 750, 925, 1100]),
        R('Bernanke Railroad'),
        P('Woodford Ave', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
        P('Yellen Ave', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
        U('Water Works'),
        P('Keynes Gardens', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
        { name: 'Go to Jail', type: 'gotojail' },
        P('Hayek Ave', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
        P('Minsky Ave', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
        { name: 'Community Treasury', type: 'community' },
        P('Schumpeter Ave', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
        R('Short Line Railroad'),
        { name: 'Exogenous Shock!', type: 'shock' },
        P('Fisher Place', 'dark-blue', 350, [35, 175, 500, 1100, 1300, 1500]),
        { name: 'Luxury Tax', type: 'tax', amount: 100 },
        P('Hotelling Walk', 'dark-blue', 400, [50, 200, 600, 1400, 1700, 2000]),
    ];

    // Economic shock deck (replaces Chance). size is in percentage points of the equation it hits
    // (demand -> output gap, supply -> inflation, financial -> credit spread); rho is persistence
    // per quarter. 'credibility' cards move central-bank credibility directly.
    const SHOCK_CARDS = [
        { text: 'Global oil price spike! Energy costs surge.', kind: 'supply', size: 2.5, rho: 0.6 },
        { text: 'Supply-chain crisis deepens. Shipping costs soar.', kind: 'supply', size: 1.5, rho: 0.75 },
        { text: 'Sweeping import tariffs imposed. Prices jump.', kind: 'supply', size: 1.2, rho: 0.8 },
        { text: 'AI breakthrough boosts productivity. Costs fall.', kind: 'supply', size: -1.5, rho: 0.7 },
        { text: 'Bumper harvest. Food prices tumble.', kind: 'supply', size: -1.0, rho: 0.5 },
        { text: 'Major fiscal stimulus package passes.', kind: 'demand', size: 1.5, rho: 0.7 },
        { text: 'Consumer confidence surges. Spending booms.', kind: 'demand', size: 1.0, rho: 0.6 },
        { text: 'Housing frenzy: everyone wants to build.', kind: 'demand', size: 1.2, rho: 0.7 },
        { text: 'Government austerity drive cuts spending.', kind: 'demand', size: -1.2, rho: 0.7 },
        { text: 'Recession fears: households stop spending.', kind: 'demand', size: -1.5, rho: 0.6 },
        { text: 'Major bank fails! Credit markets seize up.', kind: 'financial', size: 2.5, rho: 0.6 },
        { text: 'Credit crunch: banks tighten lending standards.', kind: 'financial', size: 1.5, rho: 0.6 },
        { text: 'Risk-on rally: credit spreads collapse.', kind: 'financial', size: -1.0, rho: 0.6 },
        { text: 'Politicians pressure the central bank to cut rates. Credibility falls.', kind: 'credibility', size: -0.25 },
        { text: 'Famously hawkish central banker appointed. Credibility rises.', kind: 'credibility', size: 0.15 },
        { text: 'Calm quarter. Markets shrug.', kind: 'none', size: 0 },
    ];

    // Community Treasury: the classic feel. Amounts are indexed to the price level.
    const COMMUNITY_CARDS = [
        { text: 'Advance to GO.', action: 'move_to', position: 0 },
        { text: 'Bank error in your favour. Collect $200.', action: 'get_cash', amount: 200 },
        { text: "Doctor's fees. Pay $50.", action: 'pay_cash', amount: 50 },
        { text: 'From sale of stock you get $50.', action: 'get_cash', amount: 50 },
        { text: 'Get Out of Jail Free.', action: 'jail_card' },
        { text: 'Go to Jail. Go directly to Jail.', action: 'go_to_jail' },
        { text: 'Grand Opera Night. Collect $50 from every player.', action: 'get_from_players', amount: 50 },
        { text: 'Holiday fund matures. Receive $100.', action: 'get_cash', amount: 100 },
        { text: 'Income tax refund. Collect $20.', action: 'get_cash', amount: 20 },
        { text: 'It is your birthday. Collect $10 from every player.', action: 'get_from_players', amount: 10 },
        { text: 'Life insurance matures. Collect $100.', action: 'get_cash', amount: 100 },
        { text: 'Pay hospital fees of $100.', action: 'pay_cash', amount: 100 },
        { text: 'Pay school fees of $50.', action: 'pay_cash', amount: 50 },
        { text: 'Receive $25 consultancy fee.', action: 'get_cash', amount: 25 },
        { text: 'You inherit $100.', action: 'get_cash', amount: 100 },
        { text: 'General repairs: pay $40 per house and $115 per hotel.', action: 'repairs', house: 40, hotel: 115 },
    ];

    const api = { GROUPS, SQUARES, SHOCK_CARDS, COMMUNITY_CARDS };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MM = Object.assign(root.MM || {}, api);
})(typeof self !== 'undefined' ? self : this);
