import "server-only";
import { after } from "next/server";
import { matchCandidate, matchJob } from "@/lib/matching/engine";
import { runNotifier } from "@/lib/email/notifier";
import { getEmailSender } from "@/lib/email/sender";
import { getPool } from "@/lib/db";
import { engineDeps } from "./context";

/**
 * Run matching + notification after the response is sent. Cron
 * (/api/cron/run) picks up anything missed, since needs_matching stays set
 * until a run succeeds.
 */
export function scheduleJobMatching(jobId: string) {
  after(async () => {
    try {
      await matchJob(engineDeps(), jobId);
      await runNotifier({ db: getPool(), sender: getEmailSender() });
    } catch (e) {
      console.error("[background] job matching failed", jobId, e);
    }
  });
}

export function scheduleCandidateMatching(candidateId: string) {
  after(async () => {
    try {
      await matchCandidate(engineDeps(), candidateId);
      await runNotifier({ db: getPool(), sender: getEmailSender() });
    } catch (e) {
      console.error("[background] candidate matching failed", candidateId, e);
    }
  });
}

export function scheduleEmailDelivery() {
  after(async () => {
    try {
      await runNotifier({ db: getPool(), sender: getEmailSender() });
    } catch (e) {
      console.error("[background] notifier failed", e);
    }
  });
}
