/**
 * Inngest function registry. Phase 7 wires the real workflows; this file is
 * the stable import surface so `/api/inngest` always serves every function
 * defined in the repo.
 */

import { outreachLeadDiscovered } from "./outreach";
import { refusalAppealDiscovered } from "./appeals";

export const functions = [outreachLeadDiscovered, refusalAppealDiscovered];
