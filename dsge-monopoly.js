// dsge-monopoly.js - Complete DSGE Monopoly Implementation

class DSGEMonopoly {
    constructor() {
        // Core game state
        this.gameState = {
            isStarted: false,
            currentPlayer: 0,
            turn: 1,
            playerTurnCount: 0,
            players: [],
            properties: [],
            economicShocks: [],
            activeShock: null,
            turnLog: {
                totalSpending: 0
            }
        };
        
        // DSGE Economic Parameters
        this.economy = {
            params: {
                inflationTarget: 0.02,   // pi*
                naturalRate: 0.02,       // r_bar
                potentialOutput: 100,    // y_bar
                beta: 0.60,              // Inflation persistence (from 0.85)
                kappa: 0.10,             // Phillips curve slope (from 0.25)
                phi_pi: 1.5,             // Taylor rule response to inflation
                phi_y: 0.25,              // Taylor rule response to output gap
                sigma: 1.0,              // IS curve sensitivity (from 50.0)
                lambda_prop: 0.5,        // Property price sensitivity to inflation
                eps_y_std: 0.5,          // Std dev of output shock (was 1.0)
                eps_pi_std: 0.0025       // Std dev of inflation shock (was 0.005)
            },
            inflation: 0.02,
            interestRate: 0.02,
            economicActivity: 100,
            goPayout: 200, // Add initial GO payout
            inflationHistory: [],
            interestRateHistory: [],
            outputHistory: []
        };
        
        this.inflationChart = null;
        this.outputChart = null;
        
        this.chanceCards = [];
        this.communityChestCards = [];
        
        this.initializeProperties();
        this.initializeDecks();
        this.initializeShockCards();
        this.setupEventListeners();
    }

    initializeProperties() {
        // Define property groups with DSGE characteristics
        this.propertyGroups = {
            'brown': { 
                baseAppreciation: 0.02, 
                volatility: 0.15, 
                interestSensitivity: 0.6,
                name: 'Low-End Properties' 
            },
            'light-blue': { 
                baseAppreciation: 0.025, 
                volatility: 0.12, 
                interestSensitivity: 0.7,
                name: 'Entry-Level Properties' 
            },
            'pink': { 
                baseAppreciation: 0.03, 
                volatility: 0.18, 
                interestSensitivity: 0.8,
                name: 'Mid-Tier Properties' 
            },
            'orange': { 
                baseAppreciation: 0.035, 
                volatility: 0.22, 
                interestSensitivity: 0.9,
                name: 'Popular Properties' 
            },
            'red': { 
                baseAppreciation: 0.04, 
                volatility: 0.25, 
                interestSensitivity: 1.0,
                name: 'Premium Properties' 
            },
            'yellow': { 
                baseAppreciation: 0.045, 
                volatility: 0.28, 
                interestSensitivity: 1.1,
                name: 'High-End Properties' 
            },
            'green': { 
                baseAppreciation: 0.05, 
                volatility: 0.3, 
                interestSensitivity: 1.2,
                name: 'Luxury Properties' 
            },
            'blue': { 
                baseAppreciation: 0.055, 
                volatility: 0.35, 
                interestSensitivity: 1.3,
                name: 'Ultra-Luxury Properties' 
            }
        };

        // Standard Monopoly board layout with DSGE enhancements
        this.boardSquares = [
            { name: 'GO', type: 'special', action: 'go' },
            { name: 'Friedman Ave', type: 'property', group: 'brown', basePrice: 60, baseRent: 2 },
            { name: 'Community Treasury', type: 'card', deck: 'community' },
            { name: 'Blanchard Ave', type: 'property', group: 'brown', basePrice: 60, baseRent: 4 },
            { name: 'Income Tax', type: 'tax', amount: 200 },
            { name: 'Mankiw Railroad', type: 'railroad', basePrice: 200, baseRent: 25 },
            { name: 'Prescott Ave', type: 'property', group: 'light-blue', basePrice: 100, baseRent: 6 },
            { name: 'Exogenous Shocks!', type: 'card', deck: 'chance' },
            { name: 'Diamond Plaza', type: 'property', group: 'light-blue', basePrice: 100, baseRent: 6 },
            { name: 'Greenspan Ave', type: 'property', group: 'light-blue', basePrice: 120, baseRent: 8 },
            { name: 'Jail', type: 'special', action: 'jail' },
            { name: 'St. Acemoglu Place', type: 'property', group: 'pink', basePrice: 140, baseRent: 10 },
            { name: 'Electric Company', type: 'utility', basePrice: 150 },
            { name: 'States Ave', type: 'property', group: 'pink', basePrice: 140, baseRent: 10 },
            { name: 'Virginia Ave', type: 'property', group: 'pink', basePrice: 160, baseRent: 12 },
            { name: 'Pennsylvania Railroad', type: 'railroad', basePrice: 200, baseRent: 25 },
            { name: 'St. James Place', type: 'property', group: 'orange', basePrice: 180, baseRent: 14 },
            { name: 'Community Treasury', type: 'card', deck: 'community' },
            { name: 'Dixit Place', type: 'property', group: 'orange', basePrice: 180, baseRent: 14 },
            { name: 'Stiglitz Ave', type: 'property', group: 'orange', basePrice: 200, baseRent: 16 },
            { name: 'Suboptimal Free Parking', type: 'special', action: 'parking' },
            { name: 'Lucas St.', type: 'property', group: 'red', basePrice: 220, baseRent: 18 },
            { name: 'Exogenous Shocks!', type: 'card', deck: 'chance' },
            { name: 'Krugman Institute', type: 'property', group: 'red', basePrice: 220, baseRent: 18 },
            { name: 'Illinois Ave', type: 'property', group: 'red', basePrice: 240, baseRent: 20 },
            { name: 'B&O Railroad', type: 'railroad', basePrice: 200, baseRent: 25 },
            { name: 'Atlantic Ave', type: 'property', group: 'yellow', basePrice: 260, baseRent: 22 },
            { name: 'Ventnor Ave', type: 'property', group: 'yellow', basePrice: 260, baseRent: 22 },
            { name: 'Water Works', type: 'utility', basePrice: 150 },
            { name: 'Keynes Gardens', type: 'property', group: 'yellow', basePrice: 280, baseRent: 24 },
            { name: 'Go to Jail', type: 'special', action: 'gotojail' },
            { name: 'Pacific Ave', type: 'property', group: 'green', basePrice: 300, baseRent: 26 },
            { name: 'North Carolina Ave', type: 'property', group: 'green', basePrice: 300, baseRent: 26 },
            { name: 'Community Treasury', type: 'card', deck: 'community' },
            { name: 'Pennsylvania Ave', type: 'property', group: 'green', basePrice: 320, baseRent: 28 },
            { name: 'Short Line Railroad', type: 'railroad', basePrice: 200, baseRent: 25 },
            { name: 'Chance', type: 'card', deck: 'chance' },
            { name: 'Park Place', type: 'property', group: 'blue', basePrice: 350, baseRent: 35 },
            { name: 'Luxury Tax', type: 'tax', amount: 100 },
            { name: 'Hotelling Walk', type: 'property', group: 'blue', basePrice: 400, baseRent: 50 }
        ];

        // Initialize properties with current market values
        this.properties = this.boardSquares.map((square, index) => ({
            ...square,
            id: index,
            currentPrice: square.basePrice || 0,
            currentRent: square.baseRent || 0,
            owner: null,
            mortgaged: false,
            appreciationHistory: [],
            houses: 0,
            houseCost: this.getHouseCostForGroup(square.group),
            rentLevels: this.getRentLevelsForGroup(square.group, square.baseRent),
            inflationLambda: this.getLambdaForGroup(square.group),
            demandFactor: 0.1 + (Math.random() * 0.1) // 0.1 to 0.2
        }));

        this.renderBoard();
    }

    getLambdaForGroup(group) {
        switch (group) {
            case 'brown': return 0.8;
            case 'light-blue': return 0.9;
            case 'pink': return 0.95;
            case 'orange': return 1.0;
            case 'red': return 1.05;
            case 'yellow': return 1.1;
            case 'green': return 1.15;
            case 'dark-blue': return 1.2;
            default: return 0.5; // For railroads, utilities
        }
    }

    getHouseCostForGroup(group) {
        switch (group) {
            case 'brown': case 'light-blue': return 50;
            case 'pink': case 'orange': return 100;
            case 'red': case 'yellow': return 150;
            case 'green': case 'dark-blue': return 200;
            default: return 0;
        }
    }

    getRentLevelsForGroup(group, baseRent) {
        // Rent progression for houses/hotel. Returns array: [base, 1h, 2h, 3h, 4h, hotel]
        if (!group) return [baseRent];
        const multiplier = [5, 15, 45, 80, 125]; // Standard-ish multipliers
        return [
            baseRent,
            baseRent * multiplier[0],
            baseRent * multiplier[1],
            baseRent * multiplier[2],
            baseRent * multiplier[3],
            baseRent * multiplier[4]
        ];
    }

    initializeDecks() {
        // --- Chance Cards are now Economic Shocks ---
        this.chanceCards = [
            { text: "Global oil price spike! Inflation temporarily rises.", action: 'economic_shock', effect: { inflation: 0.03 } },
            { text: "Supply chain crisis deepens. Inflation gets worse.", action: 'economic_shock', effect: { inflation: 0.02 } },
            { text: "Central Bank unexpectedly raises interest rate targets. Inflation cools.", action: 'economic_shock', effect: { inflation: -0.015 } },
            { text: "Breakthrough in AI boosts productivity! Inflation eases.", action: 'economic_shock', effect: { inflation: -0.02 } },
            { text: "Government announces major infrastructure spending. Inflationary pressures mount.", action: 'economic_shock', effect: { inflation: 0.025 } },
            { text: "Bumper harvest leads to lower food prices. Disinflationary shock.", action: 'economic_shock', effect: { inflation: -0.01 } },
            { text: "New trade tariffs imposed on imports. Prices jump.", action: 'economic_shock', effect: { inflation: 0.015 } },
            { text: "Consumer confidence surges, spending increases. Inflation ticks up.", action: 'economic_shock', effect: { inflation: 0.01 } },
            { text: "A major bank requires a bailout, shaking confidence. Mildly deflationary.", action: 'economic_shock', effect: { inflation: -0.005 } },
            { text: "Technological stagnation reported in key sectors. Inflationary pressure builds.", action: 'economic_shock', effect: { inflation: 0.01 } },
            { text: "International peace treaty signed, opening new markets. Disinflationary.", action: 'economic_shock', effect: { inflation: -0.01 } },
            { text: "Housing market boom cools faster than expected. Deflationary pressure.", action: 'economic_shock', effect: { inflation: -0.015 } },
        ];

        // --- Community Chest Cards ---
        this.communityChestCards = [
            { text: "Advance to Go (Collect $200)", action: 'move_to', position: 0 },
            { text: "Bank error in your favor. Collect $200.", action: 'get_cash', amount: 200 },
            { text: "Doctor's fees. Pay $50.", action: 'pay_cash', amount: 50 },
            { text: "From sale of stock you get $50.", action: 'get_cash', amount: 50 },
            { text: "Get Out of Jail Free.", action: 'get_out_of_jail' },
            { text: "Go to Jail. Go directly to jail.", action: 'go_to_jail' },
            { text: "Grand Opera Night. Collect $50 from every player for opening night seats.", action: 'get_from_players', amount: 50 },
            { text: "Holiday Fund matures. Receive $100.", action: 'get_cash', amount: 100 },
            { text: "Income tax refund. Collect $20.", action: 'get_cash', amount: 20 },
            { text: "It is your birthday. Collect $10 from every player.", action: 'get_from_players', amount: 10 },
            { text: "Life insurance matures. Collect $100.", action: 'get_cash', amount: 100 },
            { text: "Pay hospital fees of $100.", action: 'pay_cash', amount: 100 },
            { text: "Pay school fees of $150.", action: 'pay_cash', amount: 150 },
            { text: "Receive $25 consultancy fee.", action: 'get_cash', amount: 25 },
            { text: "You have won second prize in a beauty contest. Collect $10.", action: 'get_cash', amount: 10 },
            { text: "You inherit $100.", action: 'get_cash', amount: 100 },
            { text: "You have been elected Chairman of the Board. Pay each player $50.", action: 'pay_players', amount: 50 },
            { text: "Make general repairs on all your property: For each house pay $25, for each hotel $100", action: 'repairs', house: 25, hotel: 100 },
        ];
        
        this.shuffleDecks();
    }

    shuffleDecks() {
        // Use Fisher-Yates shuffle
        for (let i = this.chanceCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.chanceCards[i], this.chanceCards[j]] = [this.chanceCards[j], this.chanceCards[i]];
        }
        for (let i = this.communityChestCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.communityChestCards[i], this.communityChestCards[j]] = [this.communityChestCards[j], this.communityChestCards[i]];
        }
        this.showMessage('Card decks have been shuffled.');
    }

    initializeShockCards() {
        this.economicShocks = [
            {
                name: "Tech Productivity Boom",
                description: "Technological advancement increases productivity across all sectors",
                type: "positive_supply",
                duration: 3,
                effects: {
                    inflation: -0.01,
                    economicActivity: 15,
                    propertyAppreciation: 0.02
                }
            },
            {
                name: "Oil Price Shock",
                description: "Sudden increase in energy costs drives up inflation",
                type: "cost_push",
                duration: 2,
                effects: {
                    inflation: 0.015,
                    economicActivity: -8,
                    propertyAppreciation: -0.01
                }
            },
            {
                name: "Financial Crisis Warning",
                description: "Market uncertainty leads to flight to safety",
                type: "recession",
                duration: 4,
                effects: {
                    inflation: -0.005,
                    economicActivity: -20,
                    interestRateCut: 0.01
                }
            },
            {
                name: "Global Trade Expansion",
                description: "Increased international trade boosts economic activity",
                type: "demand_boost",
                duration: 3,
                effects: {
                    inflation: 0.008,
                    economicActivity: 12,
                    propertyAppreciation: 0.015
                }
            },
            {
                name: "Demographic Shift",
                description: "Population changes affect labor markets and housing demand",
                type: "structural",
                duration: 5,
                effects: {
                    propertyAppreciation: 0.01,
                    economicActivity: 5,
                    sectorSpecific: { 'residential': 0.025 }
                }
            }
        ];
    }
    
    applyEconomicShock() {
        const shock = this.gameState.activeShock;
        if (!shock) return;
        
        // Apply shock effects to economy
        if (shock.effects.inflation) {
            this.economy.inflation += shock.effects.inflation / shock.duration;
        }
        
        if (shock.effects.economicActivity) {
            this.economy.economicActivity += shock.effects.economicActivity / shock.duration;
        }
        
        if (shock.effects.interestRateCut) {
            this.economy.interestRate = Math.max(0, 
                this.economy.interestRate - shock.effects.interestRateCut / shock.duration
            );
        }
        
        // Apply to specific property groups if specified
        if (shock.effects.sectorSpecific) {
            Object.keys(shock.effects.sectorSpecific).forEach(sector => {
                const effect = shock.effects.sectorSpecific[sector];
                this.properties.forEach(property => {
                    if (property.group && property.group.includes(sector)) {
                        property.currentPrice *= (1 + effect / shock.duration);
                    }
                });
            });
        }
        
        // Decrease shock duration
        shock.turnsRemaining--;
        if (shock.turnsRemaining <= 0) {
            this.gameState.activeShock = null;
            this.gameState.turnLog.totalSpending = 0; // Reset turn log
            this.showMessage('The economic shock has ended.');
        }
    }

    // --- Player and Mortgage System ---

    startGame(numPlayers) {
        this.gameState.players = [];
        for (let i = 0; i < numPlayers; i++) {
            this.addPlayer(`Player ${i + 1}`);
        }
        this.gameState.isStarted = true;
        this.gameState.currentPlayer = 0;

        this.renderPlayerPanels();
        this.renderBoard();
        this.showMessage(`Welcome to Macro Monopoly! It's ${this.gameState.players[0].name}'s turn.`);
        this.updateEconomicDashboard();
        this.shuffleDecks();
    }

    addPlayer(name) {
        const newPlayer = {
            id: this.gameState.players.length,
            name: name,
            cash: 1500,
            position: 0,
            properties: [],
            mortgages: [],
            inJail: false,
            jailTurns: 0,
            getOutOfJailCards: 0,
            netWorth: 1500,
            realNetWorth: 1500,
            tokenColor: `hsl(${this.gameState.players.length * 60}, 70%, 50%)`
        };
        this.gameState.players.push(newPlayer);
    }

    calculateGoPayout() {
        // Returns the current GO payout, which is now updated in the macroeconomy function
        return Math.round(this.economy.goPayout);
    }
    
    updatePlayerNetWorth(player) {
        let propertyValue = 0;
        player.properties.forEach(propId => {
            const property = this.properties[propId];
            if (property) {
                // Mortgaged properties are valued at 0 for net worth calculation
                propertyValue += property.mortgaged ? 0 : property.currentPrice;
            }
        });
        player.netWorth = player.cash + propertyValue;
        
        // Calculate real net worth (inflation-adjusted)
        const cumulativeInflationFactor = (1 + this.economy.inflation) ** (this.gameState.turn / 4);
        player.realNetWorth = player.netWorth / cumulativeInflationFactor;
        
        this.renderPlayerPanels();
    }

    // --- Game Loop and Turn Management ---

    async processTurn() {
        this.gameState.playerTurnCount++;
        const player = this.gameState.players[this.gameState.currentPlayer];
        
        // Handle Jail Logic
        if (player.inJail) {
            this.handleJailTurn(player);
            return; // End turn if still in jail
        }
        
        // 3. Roll dice and move
        const diceRoll = this.rollDice();
        this.showMessage(`${player.name} rolled a ${diceRoll}.`);
        this.movePlayer(player.id, diceRoll);
        
        // 4. Process landing on square
        await this.processSquareLanding(player.id);
        
        // 5. Advance to next player
        this.nextPlayer();
    }

    rollDice() {
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        
        document.getElementById('dice-1').textContent = dice1;
        document.getElementById('dice-2').textContent = dice2;
        
        return dice1 + dice2;
    }

    movePlayer(playerId, steps) {
        const player = this.gameState.players[playerId];
        const oldPosition = player.position;
        player.position = (player.position + steps) % this.properties.length;

        // Check if player passed GO
        if (player.position < oldPosition) {
            const goPayout = this.calculateGoPayout();
            player.cash += goPayout;
            this.showMessage(`${player.name} passed GO and collected $${goPayout}.`);
            this.updatePlayerNetWorth(player);
        }

        this.renderPlayerTokens();
    }

    async processSquareLanding(playerId) {
        const player = this.gameState.players[playerId];
        const square = this.properties[player.position];
        this.showMessage(`${player.name} landed on ${square.name}.`);

        if (['property', 'railroad', 'utility'].includes(square.type) && square.owner === null) {
            // Offer to buy
            if (player.cash >= square.currentPrice) {
                if (confirm(`${player.name}, would you like to buy ${square.name} for $${square.currentPrice}?`)) {
                    player.cash -= square.currentPrice;
                    square.owner = playerId;
                    player.properties.push(square.id);
                    this.gameState.turnLog.totalSpending += square.currentPrice; // Log spending
                    this.updatePlayerNetWorth(player);
                    this.showMessage(`${player.name} bought ${square.name}.`);
                    this.renderBoard();
                    this.checkForBankruptcy(player);
                }
            }
        } else if (square.owner !== null && square.owner !== playerId && !square.mortgaged) {
            // Pay rent
            const rent = this.calculateRent(square, this.gameState.lastDiceRoll);
            if (rent > 0) {
                player.cash -= rent;
                const owner = this.gameState.players[square.owner];
                owner.cash += rent;
                this.gameState.turnLog.totalSpending += rent; // Log spending
                this.showMessage(`${player.name} paid $${rent} in rent to ${owner.name}.`);
                this.updatePlayerNetWorth(player);
                this.updatePlayerNetWorth(owner);
                this.checkForBankruptcy(player);
            }
        } else if (square.type === 'tax') {
            player.cash -= square.amount;
            this.gameState.turnLog.totalSpending += square.amount; // Log spending
            this.showMessage(`${player.name} paid $${square.amount} in taxes.`);
            this.updatePlayerNetWorth(player);
            this.checkForBankruptcy(player);
        } else if (square.type === 'card') {
            this.drawCard(player, square.deck);
        } else if (square.action === 'gotojail') {
            this.goToJail(player);
        }
    }

    nextPlayer() {
        this.updatePlayerNetWorth(this.gameState.players[this.gameState.currentPlayer]);
        this.gameState.currentPlayer = (this.gameState.currentPlayer + 1) % this.gameState.players.length;
        
        // Only update the macroeconomy and log once per full round (when it's player 0's turn again)
        if (this.gameState.currentPlayer === 0) {
            this.gameState.turn++;
            this.updateMacroeconomy();
        }

        this.renderPlayerPanels(); // To highlight the next active player
        this.showMessage(`It's now ${this.gameState.players[this.gameState.currentPlayer].name}'s turn.`);
    }

    goToJail(player) {
        this.showMessage(`${player.name} is going to Jail!`);
        player.position = 10; // Jail square
        player.inJail = true;
        player.jailTurns = 0;
        this.renderPlayerTokens();
        this.nextPlayer();
    }

    handleJailTurn(player) {
        player.jailTurns++;
        this.showMessage(`${player.name} is in jail (turn ${player.jailTurns}).`);

        if (player.getOutOfJailCards > 0) {
            if (confirm("Use 'Get Out of Jail Free' card?")) {
                player.getOutOfJailCards--;
                player.inJail = false;
                this.showMessage(`${player.name} used a card and got out of jail.`);
                this.processTurn(); // Re-run the turn, but not in jail
                return;
            }
        }
        
        if (player.cash >= 50) {
            if (confirm("Pay $50 to get out of jail?")) {
                player.cash -= 50;
                player.inJail = false;
                this.showMessage(`${player.name} paid $50 and got out of jail.`);
                this.updatePlayerNetWorth(player);
                this.processTurn();
                return;
            }
        }

        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        this.showMessage(`${player.name} rolls ${dice1} and ${dice2} from jail.`);

        if (dice1 === dice2) {
            player.inJail = false;
            this.showMessage(`${player.name} rolled doubles and got out of jail!`);
            this.movePlayer(player.id, dice1 + dice2);
            this.processSquareLanding(player.id);
            this.nextPlayer();
        } else if (player.jailTurns >= 3) {
            this.showMessage(`${player.name} failed to roll doubles for 3 turns and must pay.`);
            player.cash -= 50;
            player.inJail = false;
            this.updatePlayerNetWorth(player);
            this.movePlayer(player.id, dice1 + dice2);
            this.processSquareLanding(player.id);
            this.nextPlayer();
        } else {
            this.showMessage(`${player.name} did not roll doubles and remains in jail.`);
            this.nextPlayer();
        }
    }

    drawCard(player, deckName) {
        if (!player || !deckName) return;

        const deck = deckName === 'chance' ? this.chanceCards : this.communityChestCards;
        const card = deck.shift(); // Draw the top card
        deck.push(card); // Move it to the bottom

        this.showMessage(`Player ${player.id + 1} drew a ${deckName} card: "${card.text}"`, 'card-draw');

        // Handle card actions
        switch (card.action) {
            case 'move_to':
                this.movePlayer(player.id, (card.position - player.position + 40) % 40, false);
                break;
            case 'move_to_nearest':
                const nearest = this.findNearest(player.position, card.type);
                this.movePlayer(player.id, (nearest - player.position + 40) % 40, true); // Pay 2x rent
                break;
            case 'get_cash':
                player.cash += card.amount;
                break;
            case 'pay_cash':
                player.cash -= card.amount;
                this.checkForBankruptcy(player);
                break;
            case 'get_from_players':
                this.gameState.players.forEach(p => {
                    if (p.id !== player.id) {
                        p.cash -= card.amount;
                        player.cash += card.amount;
                        this.checkForBankruptcy(p);
                    }
                });
                break;
            case 'pay_players':
                this.gameState.players.forEach(p => {
                    if (p.id !== player.id) {
                        player.cash -= card.amount;
                        p.cash += card.amount;
                        this.checkForBankruptcy(player);
                    }
                });
                break;
            case 'get_out_of_jail':
                player.getOutOfJailCards++;
                break;
            case 'repairs':
                let repairCost = 0;
                this.properties.forEach(p => {
                    if (p.owner === player.id) {
                        if (p.houses === 5) { // Hotel
                            repairCost += card.hotel;
                        } else {
                            repairCost += p.houses * card.house;
                        }
                    }
                });
                player.cash -= repairCost;
                this.showMessage(`Player ${player.id + 1} pays $${repairCost} for property repairs.`);
                this.checkForBankruptcy(player);
                break;
            case 'go_to_jail':
                this.goToJail(player);
                break;
            case 'economic_shock':
                const shock = card.effect.inflation;
                const direction = shock > 0 ? 'rises' : 'falls';
                const magnitude = Math.abs(shock * 100);
                this.showMessage(`Economic Shock! Inflation ${direction} by ${magnitude.toFixed(2)} percentage points.`, 'economic-event');
                this.economy.inflation += shock;
                // Immediately update the economy to reflect the shock
                this.updateMacroeconomy();
                break;
        }

        this.renderPlayerPanels();
    }

    // Core DSGE macroeconomic update engine
    updateMacroeconomy() {
        // This function now mirrors the stabilized Python simulation model

        // 1. Shocks
        const p = this.economy.params;
        const eps_y = (Math.random() - 0.5) * 2 * p.eps_y_std;
        const eps_pi = (Math.random() - 0.5) * 2 * p.eps_pi_std;

        const prev_i = this.economy.interestRate;
        const prev_pi = this.economy.inflation;
        const y_bar = p.potentialOutput;
        const r_bar = p.naturalRate;

        // 2. IS Curve (calculates current output)
        const current_y = y_bar - p.sigma * (prev_i - prev_pi - r_bar) + eps_y;
        this.economy.economicActivity = current_y;
        const outputGap = current_y - y_bar;

        // 3. Phillips Curve (calculates current inflation)
        const current_pi = p.beta * prev_pi + p.kappa * outputGap + eps_pi;
        this.economy.inflation = current_pi;
        const inflationGap = current_pi - p.inflationTarget;

        // 4. Taylor Rule (calculates interest rate for NEXT turn)
        const i_unbounded = r_bar + current_pi + 
                            p.phi_pi * inflationGap + 
                            p.phi_y * outputGap;
        
        // Enforce the Zero Lower Bound
        this.economy.interestRate = Math.max(0.0, i_unbounded);

        // 5. Update GO Payout for the next turn
        const pi_effective = Math.max(-0.25, current_pi);
        this.economy.goPayout = this.economy.goPayout * (1 + pi_effective);

        // Update history for charts - FIX: Restore object format for charts
        this.economy.inflationHistory.push({ turn: this.gameState.turn, value: this.economy.inflation });
        this.economy.interestRateHistory.push({ turn: this.gameState.turn, value: this.economy.interestRate });
        this.economy.outputHistory.push({ turn: this.gameState.turn, value: this.economy.economicActivity });

        this.updateEconomicDashboard();
        this.updateEquationsTab(outputGap, inflationGap, prev_pi);

        // FIX: Re-link the macroeconomy to property values and charts
        this.updatePropertyValues();
        this.updateInflationChart();
        this.updateOutputChart();
    }

    calculateEndogenousDemand() {
        // Placeholder - the new model is more self-contained.
        // This is now handled entirely within updateMacroeconomy()
    }

    calculateRent(property, diceRoll) {
        if (property.owner === null || property.isMortgaged) {
            return 0;
        }

        const owner = this.gameState.players[property.owner];

        // Rent for properties with houses/hotels
        if (property.houses > 0) {
            return property.rentLevels[property.houses];
        }

        // Rent for utilities
        if (property.type === 'utility') {
            const numOwned = owner.properties.filter(pId => this.properties[pId].type === 'utility').length;
            return (diceRoll || 0) * (numOwned === 1 ? 4 : 10);
        }

        // Rent for railroads
        if (property.type === 'railroad') {
            const numOwned = owner.properties.filter(pId => this.properties[pId].type === 'railroad').length;
            return property.baseRent * (2 ** (numOwned - 1));
        }

        // Rent for properties in a monopoly (but with no houses)
        const monopolyGroups = this.getPlayerMonopolies(owner);
        if (monopolyGroups[property.group]) {
            // Double rent for unimproved properties in a monopoly
            return property.rentLevels[0] * 2;
        }
        
        // Standard base rent
        return property.rentLevels[0];
    }

    calculateEconomicActivity() {
        // This is now handled entirely within updateMacroeconomy()
    }

    updatePropertyValues() {
        // Bound the effect of extreme deflation
        const pi_effective = Math.max(-0.25, this.economy.inflation);

        this.properties.forEach(p => {
            if (p.type === 'property' || p.type === 'railroad' || p.type === 'utility') {
                if (!p.mortgaged) {
                     // Update price based on effective inflation and property-specific sensitivity
                    const priceChange = (1 + this.economy.params.lambda_prop * pi_effective);
                    p.currentPrice *= Math.max(0.95, priceChange); // Stabilizer from Python model
                    p.currentPrice = Math.round(p.currentPrice);
                }
                // Update rent based on the new property price
                p.currentRent = this.calculateRent(p);
            }
        });
    }

    // --- UI and Event Handling ---

    setupEventListeners() {
        // Game setup
        document.getElementById('start-game').addEventListener('click', () => {
            const numPlayers = parseInt(document.getElementById('num-players').value);
            this.economy.params.inflationTarget = parseFloat(document.getElementById('inflation-target').value) / 100;
            this.startGame(numPlayers);
        });
        
        // Dice rolling
        document.getElementById('roll-dice').addEventListener('click', () => {
            if (this.gameState.isStarted) {
                this.processTurn();
            }
        });

        // "Manage Mortgages" button
        document.getElementById('mortgage-property').addEventListener('click', () => {
            this.showMortgageDialog();
        });

        // "Manage Houses" button
        document.getElementById('manage-houses').addEventListener('click', () => {
            this.showManageHousesDialog();
        });

        // Simulation button
        document.getElementById('run-simulation').addEventListener('click', () => {
            const numGames = parseInt(document.getElementById('sim-games').value);
            const numTurns = parseInt(document.getElementById('sim-turns').value);
            this.runSimulation(numGames, numTurns);
        });

        // Tab switching
        document.querySelectorAll('.tab-link').forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;

                document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(tabId).classList.add('active');
            });
        });

        // Close modal buttons
        document.querySelectorAll('.modal .close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').style.display = 'none';
            });
        });

        this.initializeInflationChart();
        this.initializeOutputChart();
    }

    updateEconomicDashboard() {
        document.getElementById('inflation-rate').textContent = `${(this.economy.inflation * 100).toFixed(2)}%`;
        document.getElementById('interest-rate').textContent = `${(this.economy.interestRate * 100).toFixed(2)}%`;
        document.getElementById('gdp').textContent = this.economy.economicActivity.toFixed(2);
        const goPayout = this.calculateGoPayout();
        document.getElementById('go-payout-value').textContent = `$${goPayout}`;
    }

    initializeInflationChart() {
        const ctx = document.getElementById('inflation-chart').getContext('2d');
        this.inflationChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Inflation Rate (π)',
                    data: [],
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    tension: 0.3,
                    fill: true
                }, {
                    label: 'Interest Rate (i)',
                    data: [],
                    borderColor: '#c0392b',
                    backgroundColor: 'rgba(192, 57, 43, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return (value * 100).toFixed(1) + '%';
                            }
                        }
                    },
                    x: {
                         title: {
                            display: true,
                            text: 'Player Turn'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true
                    }
                }
            }
        });
        this.updateInflationChart();
    }

    updateInflationChart() {
        if (!this.inflationChart) return;

        const inflationHist = this.economy.inflationHistory;
        const interestHist = this.economy.interestRateHistory;
        
        this.inflationChart.data.labels = inflationHist.map(h => h.turn);
        this.inflationChart.data.datasets[0].data = inflationHist.map(h => h.value);
        this.inflationChart.data.datasets[1].data = interestHist.map(h => h.value);
        this.inflationChart.update();
    }

    initializeOutputChart() {
        const ctx = document.getElementById('output-chart').getContext('2d');
        this.outputChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Economic Output',
                    data: [],
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                scales: {
                    x: {
                         title: {
                            display: true,
                            text: 'Player Turn'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
        this.updateOutputChart();
    }

    updateOutputChart() {
        if (!this.outputChart) return;

        const history = this.economy.outputHistory;
        this.outputChart.data.labels = history.map(h => h.turn);
        this.outputChart.data.datasets[0].data = history.map(h => h.value);
        this.outputChart.update();
    }

    updateEquationsTab(outputGap, inflationGap, prevInflation) {
        const eqContainer = document.getElementById('equations-content');
        
        const f = (num) => num.toFixed(4); // Formatting function

        const inflationContent = `
            <div class="equation">
                <div class="equation-title">Phillips Curve (Inflation)</div>
                <div class="equation-formula">π_t = π_t-1 + λ(y_t - y*) + ε</div>
                <div class="equation-calc">
                    ${f(this.economy.inflation)} = ${f(prevInflation)} + 0.3 * (${f(outputGap)}) + (shock)
                </div>
            </div>
        `;

        const interestContent = `
            <div class="equation">
                <div class="equation-title">Taylor Rule (Interest Rate)</div>
                <div class="equation-formula">i_t = r* + π_t + φ_π(π_t - π*) + φ_y(y_t - y*)</div>
                <div class="equation-calc">
                    ${f(this.economy.interestRate)} = ${f(this.economy.params.naturalRate)} + ${f(this.economy.inflation)} + ${this.economy.params.phi_pi} * (${f(inflationGap)}) + ${this.economy.params.phi_y} * (${f(outputGap)})
                </div>
            </div>
        `;

        eqContainer.innerHTML = inflationContent + interestContent;
    }

    renderBoard() {
        const boardElement = document.getElementById('game-board');
        boardElement.innerHTML = ''; // Clear existing board
        this.properties.forEach((square, index) => {
            const squareElement = document.createElement('div');
            squareElement.className = `board-square ${square.type} ${square.group || ''}`;
            if (['go', 'jail', 'parking', 'gotojail'].includes(square.action)) {
                squareElement.classList.add('corner');
            }
            squareElement.dataset.squareId = index;
            
            const position = this.getBoardPosition(index);
            squareElement.style.gridColumn = position.col;
            squareElement.style.gridRow = position.row;

            let ownerIndicator = '';
            if (square.owner !== null) {
                const owner = this.gameState.players[square.owner];
                squareElement.style.borderColor = owner.tokenColor;
                squareElement.style.borderWidth = '2px';
            } else {
                squareElement.style.borderColor = '#888';
                squareElement.style.borderWidth = '1px';
            }
            
            squareElement.innerHTML = `
                ${square.group ? `<div class="property-color ${square.group}"></div>` : ''}
                <div class="name">${square.name}</div>
                ${square.currentPrice ? `<div class="price">$${Math.round(square.currentPrice)}</div>`: ''}
                <div class="token-container"></div>
            `;
            
            boardElement.appendChild(squareElement);
        });
        this.renderPlayerTokens();
    }

    renderPlayerPanels() {
        const panelsElement = document.getElementById('player-panels');
        panelsElement.innerHTML = '';
        this.gameState.players.forEach((player, index) => {
            const panel = document.createElement('div');
            panel.className = 'player-panel';
            if (index === this.gameState.currentPlayer) {
                panel.classList.add('active');
            }
            panel.innerHTML = `
                <h3>
                    <div class="player-token-icon" style="background-color: ${player.tokenColor};"></div>
                    ${player.name}
                </h3>
                <p><strong>Cash:</strong> $${player.cash}</p>
                <p><strong>Net Worth:</strong> $${Math.round(player.netWorth)}</p>
                <p><strong>Real Net Worth:</strong> $${Math.round(player.realNetWorth)}</p>
            `;
            panelsElement.appendChild(panel);
        });
    }

    renderPlayerTokens() {
        // Clear old tokens from containers
        document.querySelectorAll('.token-container').forEach(c => c.innerHTML = '');

        // Draw new ones
        this.gameState.players.forEach(player => {
            const token = document.createElement('div');
            token.className = 'player-token';
            token.style.backgroundColor = player.tokenColor;
            
            const squareContainer = document.querySelector(`[data-square-id='${player.position}'] .token-container`);
            if (squareContainer) {
                squareContainer.appendChild(token);
            }
        });
    }

    showMessage(message, className = '') {
        const logElement = document.querySelector('#message-log .messages');
        const messageEl = document.createElement('p');
        messageEl.textContent = message;
        if (className) {
            messageEl.classList.add(className);
        }
        logElement.appendChild(messageEl);
        logElement.scrollTop = logElement.scrollHeight; // Auto-scroll
    }

    getBoardPosition(squareIndex) {
        const sideLength = 11; // 11 squares per side (corner counts for both)
        if (squareIndex >= 0 && squareIndex < sideLength) { // Bottom row
            return { row: sideLength, col: sideLength - squareIndex };
        }
        if (squareIndex >= sideLength && squareIndex < sideLength * 2 - 1) { // Left col
            return { row: sideLength - (squareIndex - (sideLength - 1)), col: 1 };
        }
        if (squareIndex >= sideLength * 2 - 1 && squareIndex < sideLength * 3 - 2) { // Top row
            return { row: 1, col: squareIndex - (sideLength * 2 - 2) + 1 };
        }
        if (squareIndex >= sideLength * 3 - 2 && squareIndex < sideLength * 4 - 3) { // Right col
            return { row: squareIndex - (sideLength * 3 - 3) + 1, col: sideLength };
        }
        return { row: 1, col: 1 }; // Default
    }

    // --- Mortgage UI and Logic ---

    showMortgageDialog() {
        const player = this.gameState.players[this.gameState.currentPlayer];
        const modal = document.getElementById('mortgage-modal');
        const list = document.getElementById('mortgage-property-list');
        list.innerHTML = ''; // Clear previous list

        const propertiesToManage = player.properties.map(id => this.properties[id]);

        if (propertiesToManage.length === 0) {
            list.innerHTML = '<p>You do not own any properties to manage.</p>';
        } else {
            propertiesToManage.forEach(property => {
                const item = document.createElement('div');
                item.className = 'property-item';

                const name = document.createElement('span');
                name.className = 'property-name';
                name.textContent = property.name;
                item.appendChild(name);

                const status = document.createElement('span');
                status.className = 'property-status';
                item.appendChild(status);

                const actionButton = document.createElement('button');

                if (property.mortgaged) {
                    const unmortgageCost = Math.round((property.currentPrice * 0.5) * (1 + this.economy.interestRate + 0.02));
                    status.textContent = `Mortgaged (Unmortgage for $${unmortgageCost})`;
                    actionButton.textContent = 'Unmortgage';
                    actionButton.className = 'unmortgage-btn';
                    if (player.cash < unmortgageCost) {
                        actionButton.disabled = true;
                    }
                    actionButton.onclick = () => {
                        player.cash -= unmortgageCost;
                        property.mortgaged = false;
                        this.showMessage(`${player.name} unmortgaged ${property.name}.`);
                        this.renderBoard();
                        this.renderPlayerPanels();
                        this.showMortgageDialog(); // Refresh dialog
                        this.checkForBankruptcy(player);
                    };
                } else {
                    const mortgageValue = Math.round(property.currentPrice * 0.5);
                    status.textContent = `Unmortgaged (Mortgage for $${mortgageValue})`;
                    actionButton.textContent = 'Mortgage';
                    actionButton.className = 'mortgage-btn';
                    actionButton.onclick = () => {
                        player.cash += mortgageValue;
                        property.mortgaged = true;
                        this.showMessage(`${player.name} mortgaged ${property.name}.`);
                        this.renderBoard();
                        this.renderPlayerPanels();
                        this.showMortgageDialog(); // Refresh dialog
                        this.checkForBankruptcy(player);
                    };
                }
                item.appendChild(actionButton);
                list.appendChild(item);
            });
        }

        modal.style.display = 'block';
    }

    // --- House Management UI and Logic ---

    showManageHousesDialog() {
        const player = this.gameState.players[this.gameState.currentPlayer];
        const modal = document.getElementById('manage-houses-modal');
        const list = document.getElementById('manage-houses-property-list');
        list.innerHTML = '';

        const monopolies = this.getPlayerMonopolies(player);

        if (Object.keys(monopolies).length === 0) {
            list.innerHTML = '<p>You must own all properties of a color group to build houses.</p>';
            modal.style.display = 'block';
            return;
        }

        for (const group in monopolies) {
            const propertiesInGroup = monopolies[group];
            const groupDiv = document.createElement('div');
            groupDiv.className = 'property-group';

            const title = document.createElement('h4');
            title.textContent = `${group.charAt(0).toUpperCase() + group.slice(1)} Group`;
            groupDiv.appendChild(title);

            propertiesInGroup.forEach(property => {
                const item = this.createHouseManagementItem(player, property, propertiesInGroup);
                groupDiv.appendChild(item);
            });
            list.appendChild(groupDiv);
        }

        modal.style.display = 'block';
    }

    createHouseManagementItem(player, property, groupProperties) {
        const item = document.createElement('div');
        item.className = 'property-item';

        const name = document.createElement('span');
        name.className = 'property-name';
        name.textContent = `${property.name} (${property.houses < 5 ? `${property.houses} houses` : 'Hotel'})`;
        item.appendChild(name);

        const canBuild = this.canBuildHouse(player, property, groupProperties);
        const buildButton = document.createElement('button');
        buildButton.textContent = property.houses < 4 ? 'Build House' : 'Build Hotel';
        buildButton.disabled = !canBuild;
        buildButton.onclick = () => {
            player.cash -= property.houseCost;
            property.houses++;
            this.gameState.turnLog.totalSpending += property.houseCost; // Log spending
            this.showMessage(`${player.name} built a ${property.houses < 5 ? 'house' : 'hotel'} on ${property.name}.`);
            this.renderBoard();
            this.renderPlayerPanels();
            this.showManageHousesDialog();
            this.checkForBankruptcy(player);
        };

        const canSell = property.houses > 0;
        const sellButton = document.createElement('button');
        sellButton.textContent = 'Sell';
        sellButton.disabled = !canSell;
        sellButton.onclick = () => {
            player.cash += property.houseCost / 2;
            property.houses--;
            this.gameState.turnLog.totalSpending -= property.houseCost / 2; // Log spending
            this.showMessage(`${player.name} sold a house on ${property.name}.`);
            this.renderBoard();
            this.renderPlayerPanels();
            this.showManageHousesDialog();
        };

        item.appendChild(buildButton);
        item.appendChild(sellButton);
        return item;
    }

    canBuildHouse(player, property, groupProperties) {
        if (property.isMortgaged || property.houses >= 5 || player.cash < property.houseCost) {
            return false;
        }
        // Even building rule: Cannot build a house if another property in the group has fewer houses.
        const minHouses = Math.min(...groupProperties.map(p => p.houses));
        return property.houses === minHouses;
    }

    getPlayerMonopolies(player) {
        const monopolies = {};
        const propertyGroups = {};

        // Group player's properties by their color group
        player.properties.forEach(propId => {
            const property = this.properties[propId];
            if (property && property.group) {
                if (!propertyGroups[property.group]) {
                    propertyGroups[property.group] = [];
                }
                propertyGroups[property.group].push(property);
            }
        });

        // Check if the player owns all properties in any group
        for (const group in propertyGroups) {
            const allPropertiesInGroup = this.properties.filter(p => p.group === group);
            if (propertyGroups[group].length === allPropertiesInGroup.length) {
                monopolies[group] = propertyGroups[group];
            }
        }
        return monopolies;
    }

    // --- Simulation Engine ---

    async runSimulation(numGames, numTurns) {
        const resultsContainer = document.getElementById('simulation-results');
        resultsContainer.innerHTML = '<p>Running simulations... This may take a moment.</p>';

        await new Promise(resolve => setTimeout(resolve, 100)); // Allow UI to update

        const allGameResults = [];

        for (let i = 0; i < numGames; i++) {
            this.resetGameForSimulation();

            for (let t = 0; t < numTurns; t++) {
                this.processHeadlessTurn();
            }
            
            // Log results for this game
            allGameResults.push(this.getGameResults());
        }

        this.displaySimulationResults(allGameResults);
    }

    resetGameForSimulation() {
        // A lightweight reset for simulation purposes
        this.gameState.players = [];
        const numPlayers = 2; // Default to 2 players for simulation
        for (let i = 0; i < numPlayers; i++) {
            this.addPlayer(`Player ${i + 1}`);
        }
        
        this.initializeProperties(); // Reset properties
        this.shuffleDecks();

        this.gameState.currentPlayer = 0;
        this.gameState.turn = 1;
        this.gameState.playerTurnCount = 0;
        this.economy.inflation = 0.02;
        this.economy.interestRate = 0.02;
        this.economy.economicActivity = 100;
        this.economy.goPayout = 200; // Reset GO payout on simulation reset
    }

    processHeadlessTurn() {
        const player = this.gameState.players[this.gameState.currentPlayer];
        
        // Simplified jail logic for bots
        if (player.inJail) {
            if (player.cash > 50) player.cash -= 50;
            player.inJail = false;
            // No turn processing after getting out of jail in simulation
        } else {
            // Only roll and move if not in jail
            this.updateMacroeconomy();
            
            const diceRoll = this.rollDice();
            
            const oldPosition = player.position;
            player.position = (player.position + diceRoll) % this.properties.length;
            if (player.position < oldPosition) {
                player.cash += this.calculateGoPayout();
            }

            this.handleHeadlessLanding(player);
        }

        this.gameState.currentPlayer = (this.gameState.currentPlayer + 1) % this.gameState.players.length;
        if (this.gameState.currentPlayer === 0) {
            this.gameState.turn++;
        }
    }

    handleHeadlessLanding(player) {
        const square = this.properties[player.position];

        // Automated buying logic
        if (['property', 'railroad', 'utility'].includes(square.type) && square.owner === null) {
            if (player.cash >= square.currentPrice) {
                player.cash -= square.currentPrice;
                square.owner = player.id;
                player.properties.push(square.id);
            }
        } 
        // Automated rent payment
        else if (square.owner !== null && square.owner !== player.id && !square.mortgaged) {
            // Simplified rent logic for speed
            const rent = square.baseRent || 25;
            player.cash -= rent;
            this.gameState.players[square.owner].cash += rent;
        } 
        // Automated tax payment
        else if (square.type === 'tax') {
            player.cash -= square.amount;
        } 
        // Automated go to jail
        else if (square.action === 'gotojail') {
            player.inJail = true;
            player.position = 10;
        }
    }

    getGameResults() {
        this.gameState.players.forEach(p => this.updatePlayerNetWorth(p));
        return {
            finalInflation: this.economy.inflation,
            finalInterestRate: this.economy.interestRate,
            playerNetWorths: this.gameState.players.map(p => p.netWorth),
            totalPropertiesOwned: this.properties.filter(p => p.owner !== null).length,
        };
    }

    displaySimulationResults(results) {
        const avgInflation = results.reduce((sum, r) => sum + r.finalInflation, 0) / results.length;
        const avgInterest = results.reduce((sum, r) => sum + r.finalInterestRate, 0) / results.length;
        const avgNetWorth = results.reduce((sum, r) => sum + r.playerNetWorths.reduce((s, w) => s + w, 0), 0) / (results.length * results[0].playerNetWorths.length);
        const avgProps = results.reduce((sum, r) => sum + r.totalPropertiesOwned, 0) / results.length;

        const resultsContainer = document.getElementById('simulation-results');
        resultsContainer.innerHTML = `
            <h3>Average Results over ${results.length} Games</h3>
            <table>
                <tr><th>Metric</th><th>Average Value</th></tr>
                <tr><td>Final Inflation Rate</td><td>${(avgInflation * 100).toFixed(2)}%</td></tr>
                <tr><td>Final Interest Rate</td><td>${(avgInterest * 100).toFixed(2)}%</td></tr>
                <tr><td>Player Net Worth</td><td>$${Math.round(avgNetWorth)}</td></tr>
                <tr><td>Properties Owned</td><td>${avgProps.toFixed(1)} / 28</td></tr>
            </table>
        `;
    }

    checkForBankruptcy(player) {
        if (player.cash >= 0) {
            return; // Player is solvent
        }

        this.showMessage(`${player.name} is in debt and must raise cash!`, 'warning');

        // Loop until cash is non-negative or they run out of options
        while (player.cash < 0) {
            // Step 1: Sell houses/hotels
            const propertiesWithHouses = player.properties
                .map(id => this.properties[id])
                .filter(p => p.houses > 0)
                .sort((a, b) => b.houses - a.houses); // Sell from most developed first

            if (propertiesWithHouses.length > 0) {
                const prop = propertiesWithHouses[0];
                const salePrice = prop.houseCost / 2;
                prop.houses--;
                player.cash += salePrice;
                this.showMessage(`${player.name} was forced to sell a house on ${prop.name} for $${Math.round(salePrice)}.`);
                this.updatePlayerNetWorth(player);
                this.renderBoard();
                continue; // Re-check cash balance
            }

            // Step 2: Mortgage properties
            const unmortgagedProps = player.properties
                .map(id => this.properties[id])
                .filter(p => !p.isMortgaged && p.type !== 'special');

            if (unmortgagedProps.length > 0) {
                const prop = unmortgagedProps[0];
                const mortgageValue = prop.currentPrice * 0.5;
                prop.isMortgaged = true;
                player.cash += mortgageValue;
                this.showMessage(`${player.name} was forced to mortgage ${prop.name} for $${Math.round(mortgageValue)}.`);
                this.updatePlayerNetWorth(player);
                this.renderBoard();
                continue; // Re-check cash balance
            }

            // If we reach here, there's nothing left to sell or mortgage.
            // If cash is still negative, player is bankrupt.
            if (player.cash < 0) {
                this.declarePlayerBankrupt(player);
            }
            break; // Exit loop
        }
    }

    declarePlayerBankrupt(player) {
        this.showMessage(`${player.name} has gone bankrupt and is out of the game!`, 'error');
        player.isBankrupt = true;

        // Return assets to the bank
        player.properties.forEach(propId => {
            const property = this.properties[propId];
            property.owner = null;
            property.isMortgaged = false;
            property.houses = 0;
        });

        const playerIndex = this.gameState.players.findIndex(p => p.id === player.id);
        if (playerIndex > -1) {
            this.gameState.players.splice(playerIndex, 1);
        }

        // Adjust current player index if the removed player was before or at the current index
        if (this.gameState.currentPlayer >= playerIndex && this.gameState.currentPlayer > 0) {
            this.gameState.currentPlayer--;
        }

        this.renderBoard();
        this.renderPlayerPanels();

        if (this.gameState.players.length === 1) {
            this.gameState.gameOver = true;
            this.showMessage(`${this.gameState.players[0].name} is the winner!`, 'success');
        }
    }

    handleBankruptcy(player) {
        this.showMessage(`${player.name} is in debt and must raise cash!`, 'warning');

        // Implement the logic to handle bankruptcy for the player
        // This might involve selling properties, mortgaging properties, or other actions
        // Always update UI after a cash change
        this.updatePlayerNetWorth(player);
    }
}

// Initialize the game when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new DSGEMonopoly();
    console.log('DSGE Monopoly initialized successfully!');
}); 