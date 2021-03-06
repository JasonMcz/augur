/*
 * Author: priecint
 */
/**
 *
 * @param {Object} marketOutcomesData key: outcomeID, value: outcome
 * @return {Number}
 */
export default function (marketOutcomesData) {
	return Object.keys(marketOutcomesData)
		.map(outcomeId => marketOutcomesData[outcomeId])
		.reduce((outstandingShares, outcome) => outstandingShares + parseFloat(outcome.outstandingShares), 0);
}
