# Security+ SY0-701 companion content schema

Each file `data/secplus/dN.json` (or `dNa.json`/`dNb.json` for split domains) is ONE JSON object:

{
  "id": "d1",                    // d1..d5 (for split parts still use the domain id, e.g. "d2")
  "number": 1,
  "title": "General Security Concepts",
  "weight": 12,                  // exam weight percent
  "intro": "<p>2–3 paragraphs HTML: what this domain is about, why it matters, how to study it.</p>",
  "objectives": [
    {
      "id": "1.1",
      "title": "Compare and contrast various types of security controls",   // official SY0-701 objective wording
      "videos": [
        {
          "id": "1.1-security-controls",          // objective id + kebab-case Messer video title; MUST be unique
          "title": "Security Controls",           // Professor Messer's video title, exactly as he names it
          "summary": "1–2 sentences: what Messer covers in this video.",
          "deepDive": "HTML string. 300–500 words. This is the in-depth explanation Messer does NOT give. Use <p>, <ul>, <ol>, <li>, <strong>, <em>, <table>, <tr>, <th>, <td>, <code>. NO attributes, NO double quotes inside (use single quotes if you must). Explain the WHY and the HOW, give a concrete worked example, contrast commonly confused concepts, and where relevant note what a SOC analyst or GRC analyst actually does with this in a bank/fintech (Nigeria context welcome: CBN, NDPA, Lagos fintechs, but keep it accurate and don't force it).",
          "keyTerms": [ { "term": "Compensating control", "def": "One sentence, precise, exam-ready." } ],   // 5–10 terms
          "examTips": [ "Short, specific tip about how this is tested.", "..." ],                          // 3–5 tips
          "realWorld": "<p>1 paragraph HTML: how this shows up on the job (SOC/GRC).</p>",
          "quiz": [
            { "q": "Scenario-style question text", "options": ["A","B","C","D"], "answer": 2, "explain": "Why the answer is right and the others wrong." }
          ]   // exactly 3 questions per video; answer is 0-based index
        }
      ]
    }
  ]
}

Rules:
- Valid JSON. Validate with: python3 -c "import json,sys;json.load(open(sys.argv[1]))" <file>
- No double-quote characters inside HTML strings; use single quotes or rephrase.
- Every video listed in the task prompt must appear, in that order, no extras, no omissions.
- Do not invent video durations or URLs.
- Write like a strong tutor: plain English, concrete examples, no fluff, no marketing tone.
