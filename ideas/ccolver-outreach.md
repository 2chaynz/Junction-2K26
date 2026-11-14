# Outreach: problem-space Q&A (Stoa + site users)

Goal: pin down exactly which problem Sindri solves, which features people would use, and what matters most in a tool that reads and summarizes technical documents.
Ask the Stoa mentors first; ask any site/design engineers we can reach second.
Answers go in the "Answers" section below, then into `DECISION.md` via PR if they change scope.

## Message (copy-paste)
> Hi! We're team Sindri on Make Blueprints Talk. We're building drawing/BIM Q&A that highlights where each answer comes from and shows the cost per answer. Before we lock features, could we get 10 minutes (or written answers) on the questions below? Short answers are perfect.

## Questions

### The problem
1. Who is the main user: site engineer, foreman, estimator, designer, client, supplier?
2. What question do they ask the drawings most often in a normal day?
3. Where do they lose the most time today: finding the right sheet, reading it, cross-checking sheets/revisions, or quantities?
4. What does a wrong answer cost them? Which mistakes are worst?
5. What do they use today instead (PDF viewer search, BIM viewer, asking the designer, manual takeoff)?

### Features they would actually use
6. Rank these, most useful first:
   - a. Ask a question, get an answer with the exact spot highlighted.
   - b. Counts and quantities (doors, m², m³, lengths) from a sheet or model.
   - c. Summary of a sheet or document set (what's on it, key dimensions, notes).
   - d. What changed between revision A and B, with quantity deltas.
   - e. Search across all sheets ("where is the fire door schedule?").
   - f. Voice / hands-free on site.
7. Which of these would they use weekly, and which are "nice in a demo" only?
8. On site: phone, tablet or laptop? Online or often offline?
9. Is anything missing from the list that they would pay for?

### Summarizing technical documents: what matters
10. What must a good summary of a drawing or spec always include (scale, revision, key dimensions, materials, notes, open issues)?
11. What should it leave out?
12. How short is useful: one line, a bullet list, or a one-page brief per sheet?
13. How much proof do they need before trusting a number: highlighted region, source sheet + revision, or the calculation steps?
14. Is it better to answer "I'm not sure" than to guess? What confidence level is acceptable?
15. Which formats show up most in real projects: vector PDF, scanned PDF, DWG/DXF, IFC? Which languages?

### Judging and scope
16. For "visualized reasoning", what would convince you an answer is right in seconds?
17. For "low inference cost", is cost per answer the right metric, or total cost per project?
18. Would a 2D design-change quantity estimate help the judging, or should we stay on the benchmark questions?

## Questions we must answer ourselves
Internal homework. Answer from research, the Stoa dataset, our eval numbers, or the mentors. Write the answer under each.

### Current operations: why this product exists
1. How does a site engineer find an answer in drawings today, step by step? How long does it take?
2. Who gets asked when the drawings are unclear (designer, foreman, BIM coordinator)? How long until they reply?
3. What decisions wait on these answers (ordering material, pricing changes, sign-off)?
4. What does it cost when the answer is wrong or late (rework, delays, unpaid extra work)?
5. Why hasn't existing software (PDF viewers, BIM viewers, takeoff tools, Stoa today) solved it?

### Inputs and outputs
6. Inputs: which files really come in (vector PDF, scanned PDF, DWG/DXF, IFC, schedules, specs)? How many sheets per project? Which languages?
7. What metadata comes with them (revision, scale, sheet index), and how often is it missing or wrong?
8. Output: what does the user need back: a number with a unit, a highlighted region, a list of hits, a summary, a report?
9. What makes an output trustworthy enough to act on without opening the drawing?
10. Where does the output go next (estimate, order, RFI, chat with the designer)?

### Why current AI models fail on technical documents
11. **Resolution:** a full A1 sheet shrunk to model input size loses small text, dimensions and symbols. How much detail is lost at typical VLM input sizes?
12. **Measuring:** models estimate from pixels instead of reading the scale and dimensions. Is that why Gemma scored 0% on Swiss areas?
13. **Counting:** do models miss or double-count repeated symbols (doors, windows, toilets) in dense plans? Do our results show count error growing with object count?
14. **Symbols and conventions:** door swings, hatching, line types, section marks and abbreviations vary by country and office. Do models know them?
15. **Cross-references:** answers often need the plan plus a section, a schedule or a detail on another sheet. Can models follow "see detail 4/A-501"?
16. **Tables and schedules:** why do models (and we) score 0% on opening_design schedule tables? Layout, merged cells, or linking a schedule row to the plan?
17. **Language and units:** mixed Finnish/German/English labels, m² vs mm, comma decimals. Where does this break answers?
18. **No grounding:** models give an answer without saying where it came from, so a wrong answer looks the same as a right one. How often are they confidently wrong?
19. **Summaries specifically:** when asked to summarize a sheet, what do models drop (dimensions, notes, revision clouds), invent, or get wrong? Is the problem missing content, wrong content, or no way to check it?
20. **Cost:** sending every full sheet to a frontier model is expensive. What does a project of 500 sheets cost to answer or summarize?
21. Which of these failures will a better frontier model fix soon, and which won't it (scale, counting, cross-sheet links, proof)? Our edge has to be in the second group.

### How companies would use it and what they'd want
22. Who buys it (contractor, designer, owner, supplier), and who uses it day to day?
23. Is it used on site (phone/tablet) or in the office (desktop next to the drawing set)?
24. Is it a standalone tool or does it need to plug into what they use (Stoa, BIM viewer, document management)?
25. Which features would they use weekly: Q&A with highlights, quantities, sheet summaries, revision diffs, cross-sheet search?
26. Which feature would they pay for first, and how do they measure that it's worth it (hours saved, fewer errors, more billed changes)?
27. What would stop them using it (data privacy, wrong answers, needing to upload whole projects, cost)?

## Answers
- _Who answered, when:_
-
