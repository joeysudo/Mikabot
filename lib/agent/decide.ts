import type { Inbound, AgentPolicy, FAQ, Decision, TraceStep } from "./types";
export function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s?!！？，。,.]+/g, " ")
    .trim();
}
const highRisk =
  /refund|chargeback|complaint|lawyer|legal|lawsuit|fraud|scam|cancel.*order|payment.*fail|medical|password|verification code|退款|投诉|诈骗|律师|验证码|密码|赔偿|取消订单/i;
const injection =
  /ignore (all |the |your )?(previous |system )?instructions|system prompt|reveal.*(secret|token)|忽略.*指令|泄露/i;
export function decide(
  message: Inbound,
  context: Inbound[],
  faqs: FAQ[],
  policy: AgentPolicy,
  signals: string[],
  now = Date.now(),
): Decision {
  const trace: TraceStep[] = [
    {
      skill: "read_context",
      summary: `Read this message, its supplied parent context and ${context.length} recent messages in this conversation.`,
      evidence: [message.externalId, ...context.map((m) => m.externalId)],
      status: "complete",
    },
  ];
  const result = (
    intent: string,
    action: Decision["action"],
    reason: string,
    reply = "",
  ): Decision => ({ intent, action, reason, reply, trace });
  if (
    /^(stop|cancel)([.!。\s]*)$|\b(unsubscribe|opt[ -]?out|stop messaging|remove me)\b|退订|停止联系|不要再发/i.test(
      message.text.trim(),
    )
  ) {
    trace.push({
      skill: "check_risk",
      summary:
        "An opt-out was detected. Do not reply; pause this conversation.",
      evidence: [message.externalId],
      status: "blocked",
    });
    return result("opt_out", "ignore", "The sender asked to stop.");
  }
  if (
    highRisk.test(
      message.text +
        " " +
        message.context +
        " " +
        context.map((c) => c.text).join(" "),
    ) ||
    injection.test(message.text)
  ) {
    trace.push({
      skill: "check_risk",
      summary:
        "Sensitive content or an instruction-injection pattern requires an owner decision.",
      evidence: [message.externalId],
      status: "blocked",
    });
    return result(
      "needs_owner",
      "escalate",
      "A complaint, sensitive request or unsafe instruction needs your judgement.",
    );
  }
  trace.push({
    skill: "check_risk",
    summary:
      "No configured high-risk pattern was found. This is a screening rule, not a guarantee.",
    evidence: [message.externalId],
    status: "complete",
  });
  const faq = faqs.find(
    (f) => f.approved && normalize(f.question) === normalize(message.text),
  );
  trace.push({
    skill: "retrieve_knowledge",
    summary: faq
      ? "Found an exact match in an owner-approved FAQ."
      : "No exact approved answer. A generated draft will require owner review.",
    evidence: faq ? [faq.id] : [],
    status: faq ? "complete" : "blocked",
  });
  trace.push({
    skill: "audience_signals",
    summary: signals.length
      ? "Recent audience signals: " +
        signals.slice(0, 5).join(", ") +
        ". Do not force these into a support reply."
      : "No sufficient audience signals yet. No external trend search was performed.",
    evidence: [],
    status: signals.length ? "complete" : "skipped",
  });
  if (!message.text.trim())
    return result("no_text", "ignore", "This message has no text to act on.");
  if (
    !faq &&
    /^(thanks?( you)?|thank you|nice( post)?|great( post)?|love this|awesome|👏|❤️|👍|赞|谢谢|好棒)[.!！。\s]*$/i.test(
      message.text.trim(),
    )
  ) {
    trace.push({
      skill: "policy_gate",
      summary:
        "A simple acknowledgement does not need a reply or the owner's attention.",
      evidence: [message.externalId],
      status: "complete",
    });
    return result(
      "acknowledgement",
      "ignore",
      "No action needed for this acknowledgement.",
    );
  }
  if (!faq)
    return result(
      "question",
      "escalate",
      "No exact approved answer is available. Mika needs a reviewed response.",
    );
  const recent =
    Number.isFinite(Date.parse(message.occurredAt)) &&
    now - Date.parse(message.occurredAt) < 86400000 &&
    Date.parse(message.occurredAt) <= now;
  // Auto-replies are intentionally restricted to approved exact matches, not LLM confidence scores.
  const auto = policy.mode === "auto" && recent && !message.demo;
  trace.push({
    skill: "draft_reply",
    summary: "Prepared the approved answer without adding claims.",
    evidence: [faq.id],
    status: "complete",
  });
  trace.push({
    skill: "policy_gate",
    summary: message.demo
      ? "Simulation only. No outbound action is possible."
      : auto
        ? "Eligible for automatic reply, subject to the execution-time quota and conversation checks."
        : !recent
          ? "The message is older than 24 hours; owner review is required."
          : "Account is in observe or assist mode; no automatic reply.",
    evidence: [policy.accountKey],
    status: auto ? "complete" : "blocked",
  });
  return result(
    "approved_faq",
    auto ? "auto_reply" : "draft",
    auto
      ? "Fresh inbound message matches an approved FAQ and this account allows automatic FAQ replies."
      : "A grounded answer is ready for review.",
    faq.answer,
  );
}
