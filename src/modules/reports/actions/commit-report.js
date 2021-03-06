import secureRandom from 'secure-random';
import { augur } from '../../../services/augurjs';
import { bytesToHex } from '../../../utils/bytes-to-hex';
import { CATEGORICAL, SCALAR } from '../../markets/constants/market-types';
import { SUCCESS, FAILED } from '../../transactions/constants/statuses';
import { addCommitReportTransaction } from '../../transactions/actions/add-report-transaction';
import { updateExistingTransaction } from '../../transactions/actions/update-existing-transaction';
import { updateReports } from '../../reports/actions/update-reports';
import { selectMarketFromEventID } from '../../market/selectors/market';
import { selectMarketLink, selectMarketsLink } from '../../link/selectors/links';

export function commitReport(market, reportedOutcomeID, isUnethical, isIndeterminate) {
	return (dispatch, getState) => {
		const { reports, branch } = getState();
		dispatch(addCommitReportTransaction(market, reportedOutcomeID, isUnethical, isIndeterminate));
		const branchReports = reports[branch.id];
		if (!branchReports) return selectMarketsLink(dispatch).onClick();
		const nextPendingReportEventID = Object.keys(branchReports).find(
			eventID =>	!branchReports[eventID].reportHash
		);
		const nextPendingReportMarket = selectMarketFromEventID(nextPendingReportEventID);
		if (nextPendingReportMarket) {
			selectMarketLink(nextPendingReportMarket, dispatch).onClick();
		} else {
			selectMarketsLink(dispatch).onClick();
		}
	};
}

export function sendCommitReport(transactionID, market, reportedOutcomeID, isUnethical, isIndeterminate) {
	return (dispatch, getState) => {
		const { loginAccount, blockchain, branch } = getState();
		const eventID = market.eventID;
		const branchID = branch.id;

		if (!loginAccount || !loginAccount.id || !eventID || !event || !market || !reportedOutcomeID) {
			return dispatch(updateExistingTransaction(transactionID, {
				status: FAILED, message: 'Missing data'
			}));
		}

		dispatch(updateExistingTransaction(transactionID, { status: 'sending...' }));

		const report = {
			reportPeriod: blockchain.reportPeriod.toString(),
			reportedOutcomeID,
			isCategorical: market.type === CATEGORICAL,
			isScalar: market.type === SCALAR,
			isUnethical,
			isIndeterminate,
			salt: bytesToHex(secureRandom(32)),
			reportHash: null,
			isRevealed: false
		};

		dispatch(updateReports({ [branchID]: { [eventID]: report } }));

		// TODO move to augur.js
		const fixedReport = augur.fixReport(report.reportedOutcomeID, report.isScalar, report.isIndeterminate);
		const reportHash = augur.makeHash(report.salt, fixedReport, eventID, loginAccount.id);
		let encryptedReport = 0;
		let encryptedSalt = 0;
		if (loginAccount.derivedKey) {
			const derivedKey = loginAccount.derivedKey;
			encryptedReport = augur.encryptReport(fixedReport, derivedKey, report.salt);
			encryptedSalt = augur.encryptReport(report.salt, derivedKey, loginAccount.keystore.crypto.kdfparams.salt);
		}
		augur.submitReportHash({
			event: eventID,
			reportHash,
			encryptedReport,
			encryptedSalt,
			branch: branchID,
			period: report.reportPeriod,
			periodLength: branch.periodLength,
			onSent: (res) => {
				console.debug('SRH sent:', res);
				dispatch(updateExistingTransaction(transactionID, { status: 'processing...' }));
			},
			onSuccess: (res) => {
				console.debug('SRH successful:', res);
				dispatch(updateExistingTransaction(transactionID, { status: SUCCESS }));
				report.reportHash = reportHash;
				dispatch(updateReports({ [branchID]: { [eventID]: report } }));
			},
			onFailed: (err) => {
				console.error('SRH failed', err);
				dispatch(updateExistingTransaction(transactionID, {
					status: FAILED,
					message: err.message
				}));
			}
		});
	};
}
