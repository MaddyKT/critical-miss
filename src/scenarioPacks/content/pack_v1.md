# Critical Miss — Scenario Pack v1 (draft)

Conventions used below:
- Stats: STR/DEX/CON/INT/WIS/CHA
- Each mini-arc includes 3–6 nodes.
- Effects are described in plain text; we’ll translate into code later.

---

## ARC 01 — The Delicate Art of Tax Evasion (Tavern → Street → Court)

### scene: tavern.taxman
**Category:** Tavern
**Title:** A Man With A Ledger
**Body:** A well-dressed stranger slides onto the bench like he’s been waiting for your financial mistakes. He introduces himself as a "volunteer auditor" for the Crown. His smile has the warmth of a cold coin.

Choices:
1) **"Confess everything."** (WIS DC 12)
- Success: You confess only *plausible* crimes. Auditor is impressed by your restraint. *(+XP, set flag `flags.auditPending=true`, next: street.paperwork)*
- Fail: You confess to a crime that doesn’t exist yet. You accidentally invent a felony. *(+XP small, -Gold, set `flags.auditPending=true`, next: street.paperwork)*

2) **"Bribe him with sincerity."** (CHA DC 14)
- Success: He takes your coin and your handshake. You’re now friends, which is worse. *( -Gold, set `flags.auditFriend=true`, next: street.paperwork)*
- Fail: He takes your coin as "evidence". *( -Gold more, set `flags.auditPending=true`, next: street.paperwork)*

3) **"Explain you’re "between incomes.""** (CHA DC 13)
- Success: You spin a tragic backstory involving orphans and a cursed wallet. He sniffles. *(+XP, next: street.paperwork)*
- Fail: He asks for references. You cite a barstool. *(+XP, next: street.paperwork)*

### scene: street.paperwork
**Category:** Street
**Title:** Forms: The True Dungeon
**Body:** You are handed paperwork thick enough to stop an arrow. The auditor watches you like a hawk watching a mouse learn cursive.

Choices:
1) **"Forge it."** (DEX DC 15)
- Success: Your handwriting becomes a weapon. *(+Gold, +XP, set `flags.forgedForms=true`, next: court.day)*
- Fail: You spell your own name wrong. *( -Gold, set `flags.forgedForms=maybe`, next: court.day)*

2) **"Actually read it."** (INT DC 14)
- Success: You find a loophole: ‘Adventuring expenses’ are deductible. *(+Gold, set `flags.legalLoophole=true`, next: court.day)*
- Fail: The words swim. One paragraph bites you. *( -HP small, next: court.day)*

3) **"Eat the paper."** (CON DC 13)
- Success: You finish the stack. The auditor is horrified, but technically the forms are ‘processed.’ *(+XP, set `flags.paperEater=true`, next: court.day)*
- Fail: You gag on bureaucracy. *( -HP, next: court.day)*

### scene: court.day
**Category:** Court
**Title:** The Crown vs. Your Vibes
**Body:** The judge looks like a disappointed statue. The prosecutor looks like he moisturizes with grudges.

Choices:
1) **"Represent yourself."** (CHA DC 15)
- Success: You deliver a speech about freedom, destiny, and how taxes are basically a curse. The courtroom claps reluctantly. *(+XP, +Gold, clear `flags.auditPending`)*
- Fail: You object to yourself. The judge allows it. *( -Gold, set `flags.onProbation=true`)*

2) **"Call the auditor as a character witness."** (WIS DC 14)
- Success: If `flags.auditFriend`, he says you’re "a mess, but an honest mess." Case dismissed. *(+Gold, clear pending)*
- Fail: He testifies you offered him "sincerity." Court gasps. *( -Gold, set `flags.onProbation=true`)*

3) **"Plead ‘Oops.’"** (CHA DC 12)
- Success: The judge respects humility. You get community service: cleaning the dungeon latrines. *(+XP, set `flags.latineDuty=true`)*
- Fail: The prosecutor respects nothing. *( -Gold, -HP small, set `flags.onProbation=true`)*

---

## ARC 02 — The Mimic That Wants To Be Loved (Dungeon → Camp)

### scene: dungeon.mimic_intro
**Category:** Dungeon
**Title:** Chest With Feelings
**Body:** A treasure chest sits alone in the corridor. It sighs. You hate that it sighs.

Choices:
1) **"Open it normally."** (DEX DC 13)
- Success: You open it before it commits. It contains coins and a tiny apology letter. *(+Gold, +XP, set `flags.mimicSpared=true`, next: camp.mimic_followup)*
- Fail: It kisses your hand with teeth. *( -HP, set `flags.mimicHatesYou=true`, next: camp.mimic_followup)*

2) **"Compliment it."** (CHA DC 14)
- Success: The chest blushes (somehow) and offers you a ‘gift.’ *(+Gold, set `flags.mimicSpared=true`, next: camp.mimic_followup)*
- Fail: You compliment the hinges. It’s a sensitive topic. *( -HP small, next: camp.mimic_followup)*

3) **"Hit it first."** (STR DC 12)
- Success: It yelps and retreats, leaving loot out of pure fear. *(+Gold, set `flags.mimicHatesYou=true`, next: camp.mimic_followup)*
- Fail: You punch a wall. The chest watches you do it. *( -HP small, set `flags.embarrassed=true`, next: camp.mimic_followup)*

### scene: camp.mimic_followup
**Category:** Camp
**Title:** The Chest Returns
**Body:** That night, you hear quiet scraping outside your tent. A small chest sits there like a stray cat with a violent hobby.

Choices:
1) **"Adopt it."** (WIS DC 13)
- Success: You gain a weird companion: ‘Chesty.’ *(set `flags.hasMimicPet=true`, +XP)*
- Fail: It adopts *you*. You wake up inside it. *( -HP, set `flags.hasMimicPet=true`)*

2) **"Set boundaries."** (CHA DC 12)
- Success: It agrees to only bite *enemies* and people who deserve it. *(+XP, set `flags.hasMimicPet=true`)*
- Fail: It agrees loudly, then immediately bites your boot to test the rules. *( -HP small)*

3) **"Send it away."** (CHA DC 14)
- Success: It leaves you a single coin as closure. *(+Gold small, clear mimic flags)*
- Fail: It leaves anyway but steals your socks. *( -Gold small, set `flags.sockless=true`)*

---

## ARC 03 — The Wizard’s Internship Program (Tower → Lab → Fallout)

### scene: tower.internship
**Category:** Magic
**Title:** Unpaid, Unholy Internship
**Body:** A wizard offers you an internship. The pay is “experience” and a vague threat.

Choices:
1) **"Accept."** (WIS DC 12)
- Success: You learn useful things like ‘don’t look directly at spell components.’ *(+XP, next: lab.safety)*
- Fail: You sign a contract written in smoke. *(set `flags.wizardContract=true`, next: lab.safety)*

2) **"Negotiate pay."** (CHA DC 14)
- Success: You get a stipend and a helmet. *(+Gold, +XP, next: lab.safety)*
- Fail: The wizard laughs in several languages. *( -Gold small, next: lab.safety)*

3) **"Steal his spellbook."** (DEX DC 16)
- Success: You steal it and immediately don’t understand it. *(+XP big, set `flags.stolenSpellbook=true`, next: lab.safety)*
- Fail: The spellbook steals *you* (metaphorically). *( -HP, set `flags.wizardHatesYou=true`, next: lab.safety)*

### scene: lab.safety
**Category:** Magic
**Title:** Safety Third
**Body:** The lab has three rules: don’t touch the glowing jar, don’t name the glowing jar, don’t *feed* the glowing jar.

Choices:
1) **"Follow rules."** (INT DC 13)
- Success: You keep all your fingers. Rare achievement. *(+XP, next: fallout.jar)*
- Fail: You misread ‘don’t name’ as ‘do name’. Now it’s ‘Gary.’ *(set `flags.jarNamedGary=true`, next: fallout.jar)*

2) **"Ask what’s in the jar."** (WIS DC 12)
- Success: It’s a minor demon with a major attitude. *(+XP, next: fallout.jar)*
- Fail: The wizard says "liability" and walks away. *(+XP small, next: fallout.jar)*

3) **"Feed the jar."** (CON DC 14)
- Success: It purrs. You’re disturbed but alive. *(+XP, set `flags.jarFriendly=true`, next: fallout.jar)*
- Fail: It bites through the jar. *( -HP, set `flags.jarLoose=true`, next: fallout.jar)*

### scene: fallout.jar
**Category:** Disaster
**Title:** Gary Wants Freedom
**Body:** Something escapes. The wizard blames you with the ease of a man who has never been wrong.

Choices:
1) **"Catch it with a sack."** (DEX DC 14)
- Success: You bag Gary. Gary is offended. *(+XP, +Gold small)*
- Fail: You bag yourself. *( -HP, set `flags.humiliated=true`)*

2) **"Blame the wizard first."** (CHA DC 15)
- Success: The wizard is briefly speechless. You use the moment to leave. *(+XP, clear contract flags)*
- Fail: He writes your name in a book titled ‘Later.’ *(set `flags.wizardVendetta=true`)*

3) **"Make a deal with Gary."** (CHA DC 13)
- Success: Gary agrees to haunt your enemies instead. *(set `flags.garyPact=true`, +XP)*
- Fail: Gary agrees to haunt you, specifically. *(set `flags.garyPact=true`, -HP small)*

---

## ARC 04 — The Bard’s MLM (Tavern → Street → Ruin)

### scene: tavern.mlm_pitch
**Category:** Tavern
**Title:** Multi-Level Minstrelsy
**Body:** A bard promises riches if you recruit "downline" bards. He says ‘passive income’ like it’s a spell.

Choices:
1) **"Buy in."** (WIS DC 12)
- Success: You receive pamphlets and shame. *( -Gold, set `flags.mlmMember=true`, next: street.recruit)*
- Fail: You accidentally buy the ‘premium’ package. *( -Gold more, next: street.recruit)*

2) **"Expose him."** (CHA DC 14)
- Success: The tavern cheers. The bard cries and tries to sell tissues. *(+XP, next: street.recruit)*
- Fail: The crowd turns on you. They love scams if they feel smart. *( -HP small, next: street.recruit)*

3) **"Recruit him into your heist."** (CHA DC 13)
- Success: He joins, still pitching mid-heist. *(set `flags.hasBard=true`, +XP, next: street.recruit)*
- Fail: He recruits *you* harder. *(set `flags.mlmMember=true`, next: street.recruit)*

### scene: street.recruit
**Category:** Street
**Title:** The Downline Hunger
**Body:** You corner strangers with a lute and desperation.

Choices:
1) **"Charm them."** (CHA DC 14)
- Success: Someone signs up. They will regret it forever. *(+Gold small, +XP)*
- Fail: They throw a tomato. It’s accurate. *( -HP small)*

2) **"Threaten them."** (STR DC 13)
- Success: Fear works, briefly. *(+Gold small, set `flags.badReputation=true`)*
- Fail: They threaten you back. They’re better at it. *( -HP)*

3) **"Quit."** (WIS DC 12)
- Success: You walk away. Freedom tastes like fresh air. *(clear `flags.mlmMember`)*
- Fail: The bard finds you later with more pamphlets. *(set `flags.mlmHaunted=true`)*

---

## ARC 05 — The Healing Potion That’s Mostly Vibes (Market → Field Test)

### scene: market.potion
**Category:** Market
**Title:** Discount Elixir
**Body:** A vendor sells "healing potions" in unmarked bottles. The liquid is the color of optimism and bad science.

Choices:
1) **"Drink it."** (CON DC 13)
- Success: You heal, somehow. *(+HP, -Gold)*
- Fail: You heal emotionally but not physically. *(+XP, -HP small, -Gold)*

2) **"Ask what’s inside."** (WIS DC 12)
- Success: He says "mostly mint." You hear "mostly" and flinch. *(+XP, -Gold small)*
- Fail: He says "trade secret" and bites the bottle to show confidence. *(set `flags.potionDoubt=true`)*

3) **"Test it on a rat."** (INT DC 14)
- Success: The rat becomes swole and files a complaint. *(+XP, set `flags.ratNemesis=true`)*
- Fail: The rat explodes politely. *( -HP small, set `flags.ratGhost=true`)*

---

(Next: pack_v2 will add many more arcs + more cross-cutting flags, rare crit outcomes, party member callbacks.)
