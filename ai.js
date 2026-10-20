
function analyzeInstruction(text) {
  const instruction = String(text || "").trim();

  if (!instruction) {
    throw new Error("Please enter an instruction.");
  }

  const lines = instruction
    .split(/\n|[.!?]\s+/)
    .map(line => line.trim())
    .filter(Boolean);

  return {
    summary: lines[0] || instruction,
    tasks: lines.map((description, index) => ({
      number: index + 1,
      description,
      requiresHumanReview: true
    })),
    disclaimer:
      "Review all generated tasks with an authorized clinician before use."
  };
}

function organizeClinicalNote(text) {
  const note = String(text || "").trim();

  if (!note) {
    throw new Error("Please enter note text.");
  }

  return {
    originalText: note,
    sections: {
      symptoms: "",
      observations: "",
      assessment: "",
      plan: ""
    },
    suggestedSummary: note,
    disclaimer:
      "This tool organizes text only. Verify all clinical details."
  };
}

function generateShiftHandover(text) {
  const handover = String(text || "").trim();

  if (!handover) {
    throw new Error("Please enter handover notes.");
  }

  return {
    handover,
    checklist: [
      "Confirm patient identity using approved procedures.",
      "Verify current orders and pending tasks.",
      "Confirm pending investigations and follow-up.",
      "Escalate urgent concerns to the responsible clinician."
    ],
    requiresHumanReview: true
  };
}

module.exports = {
  analyzeInstruction,
  organizeClinicalNote,
  generateShiftHandover
};
