// A light human check for revealing a job's private apply contact without an
// account (7c): a small sum, signed and short-lived, bound to one job. Combined
// with a per-IP rate limit it stops bulk harvesting without hiding jobs.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.TOKEN_SIGNING_SECRET;
  if (!s || s.length < 32) throw new Error("TOKEN_SIGNING_SECRET must be set (32+ chars)");
  return s;
}
const sign = (payload: string) => createHmac("sha256", secret()).update(`human-check:${payload}`).digest("base64url");

export function newChallenge(jobId: string, now = Date.now()) {
  const a = randomInt(2, 10);
  const b = randomInt(2, 10);
  const exp = Math.floor(now / 1000) + 15 * 60;
  const payload = `${jobId}.${a + b}.${exp}`;
  return { question: `What is ${a} + ${b}?`, token: `${exp}.${sign(payload)}` };
}

export function checkAnswer(jobId: string, token: string, answer: string, now = Date.now()): boolean {
  const [expStr, mac] = String(token).split(".");
  const exp = Number(expStr);
  const n = Number(String(answer).trim());
  if (!exp || !mac || !Number.isInteger(n) || exp < Math.floor(now / 1000)) return false;
  const expected = Buffer.from(sign(`${jobId}.${n}.${exp}`));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
