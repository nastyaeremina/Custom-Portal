/**
 * Domain Name Splitter
 *
 * Derives a human-readable brand name from a domain stem (the part before
 * the first dot, minus "www").
 *
 * Examples:
 *   jungleluxe     → "Jungle Luxe"
 *   hudsonvalley   → "Hudson Valley"
 *   mywebsite      → "My Website"
 *   the-brand-co   → "The Brand Co"
 *   airbnb         → "Airbnb"          (no clean split → title-cased stem)
 *   laddcorp       → "Laddcorp"        (no clean split → title-cased stem)
 */

// ─── Common English words used for greedy left-to-right splitting ────────
// ~300 words covering the most frequent stems found in brand domains.
// Ordered by length (longest first) within each frequency tier so the
// greedy matcher prefers longer words ("green" over "gre" + "en").

const WORD_LIST: ReadonlySet<string> = new Set([
  // 2-letter
  "ai", "an", "at", "be", "by", "do", "go", "hi", "if", "in", "is",
  "it", "me", "my", "no", "of", "on", "or", "so", "to", "up", "us",
  "we",

  // 3-letter
  "ace", "act", "add", "age", "ago", "aid", "aim", "air", "all", "and",
  "any", "app", "arc", "are", "ark", "arm", "art", "ask", "ate", "auto",
  "bad", "bag", "ban", "bar", "bay", "bed", "bet", "big", "bit", "box",
  "boy", "bug", "bus", "but", "buy", "cab", "can", "cap", "car", "cat",
  "cup", "cut", "day", "den", "dew", "did", "dig", "dim", "dot", "dry",
  "due", "dye", "ear", "eat", "eco", "egg", "elm", "end", "era", "eve",
  "eye", "fab", "fan", "far", "fat", "few", "fig", "fin", "fit", "fix",
  "fly", "fog", "for", "fox", "fun", "fur", "gap", "gas", "gem", "get",
  "got", "gum", "gun", "gut", "guy", "gym", "had", "has", "hat", "hay",
  "hen", "her", "hid", "him", "hip", "his", "hit", "hog", "hop", "hot",
  "how", "hub", "hue", "hut", "ice", "ill", "imp", "ink", "inn", "ion",
  "its", "ivy", "jam", "jar", "jaw", "jay", "jet", "job", "jog", "joy",
  "jug", "key", "kid", "kin", "kit", "lab", "lad", "lag", "lap", "law",
  "lay", "led", "leg", "let", "lid", "lie", "lip", "lit", "log", "lot",
  "low", "lux", "mad", "man", "map", "mat", "max", "may", "men", "met",
  "mid", "mix", "mob", "mod", "mom", "mop", "mud", "mug", "net", "new",
  "nil", "nod", "nor", "not", "now", "nut", "oak", "oar", "oat", "odd",
  "off", "oft", "oil", "old", "one", "opt", "orb", "ore", "our", "out",
  "owe", "owl", "own", "pad", "pal", "pan", "pat", "paw", "pay", "pea",
  "pen", "per", "pet", "pie", "pig", "pin", "pit", "ply", "pod", "pop",
  "pot", "pro", "pub", "pug", "pun", "put", "quo", "ram", "ran", "rat",
  "raw", "ray", "red", "ref", "rib", "rid", "rim", "rip", "rod", "rot",
  "row", "rub", "rug", "run", "rut", "sad", "sat", "saw", "say", "sea",
  "set", "sew", "she", "shy", "sin", "sip", "sir", "sit", "six", "ski",
  "sky", "sly", "sob", "sod", "son", "soy", "spa", "spy", "sub", "sue",
  "sum", "sun", "sup", "tab", "tag", "tan", "tap", "tar", "tax", "tea",
  "ten", "the", "tie", "tin", "tip", "toe", "ton", "too", "top", "tow",
  "toy", "try", "tub", "tug", "two", "urn", "use", "van", "vat", "vet",
  "via", "vie", "vim", "vow", "war", "was", "wax", "way", "web", "wed",
  "wet", "who", "why", "wig", "win", "wit", "woe", "wok", "won", "woo",
  "wow", "yam", "yet", "you", "zen", "zip", "zoo",

  // 4-letter
  "able", "acre", "ally", "also", "arch", "area", "aura", "auto", "avid",
  "back", "bake", "ball", "band", "bank", "bare", "bark", "barn", "base",
  "bath", "bead", "beam", "bean", "bear", "beat", "been", "beer", "bell",
  "belt", "bend", "best", "bike", "bind", "bird", "bite", "bleu", "bliss",
  "blow", "blue", "blur", "boat", "body", "bold", "bolt", "bond", "bone",
  "book", "boom", "boot", "born", "boss", "both", "bowl", "brew", "buck",
  "bulk", "bull", "bump", "burn", "bush", "busy", "buzz", "cafe", "cage",
  "cake", "call", "calm", "came", "camp", "cape", "card", "care", "cart",
  "case", "cash", "cast", "cave", "chat", "chef", "chip", "chop", "city",
  "clan", "clay", "clip", "club", "clue", "coal", "coat", "code", "coil",
  "coin", "cold", "cole", "come", "cook", "cool", "cope", "copy", "cord",
  "core", "cork", "corn", "corp", "cost", "cosy", "cozy", "crew", "crop",
  "crow", "cube", "cure", "curl", "cute", "dale", "dark", "dart", "dash",
  "data", "dawn", "deal", "dear", "deck", "deed", "deem", "deep", "deer",
  "demo", "dent", "desk", "dial", "diet", "dine", "dirt", "disc", "dish",
  "dock", "does", "done", "door", "dose", "down", "draw", "drew", "drip",
  "drop", "drum", "dual", "duck", "dude", "dune", "dusk", "dust", "duty",
  "each", "earl", "earn", "ease", "east", "easy", "edge", "edit", "else",
  "emit", "epic", "even", "ever", "evil", "exam", "exec", "exit", "expo",
  "face", "fact", "fade", "fail", "fair", "fake", "fall", "fame", "fawn",
  "farm", "fast", "fate", "feed", "feel", "fell", "felt", "fern", "file",
  "fill", "film", "find", "fine", "fire", "firm", "fish", "fist", "five",
  "flag", "flat", "flaw", "fled", "flex", "flip", "flow", "foam", "foil",
  "fold", "folk", "fond", "font", "food", "fool", "foot", "ford", "fore",
  "fork", "form", "fort", "foul", "four", "free", "frog", "from", "fuel",
  "full", "fund", "fuse", "fury", "fuzz", "gain", "gala", "gale", "game",
  "gang", "gate", "gave", "gaze", "gear", "gene", "gift", "gild", "gilt",
  "girl", "give", "glad", "glen", "glow", "glue", "goat", "goes", "gold",
  "golf", "gone", "good", "grab", "gram", "gray", "grew", "grey", "grid",
  "grin", "grip", "grow", "gulf", "gust", "hack", "hair", "hail", "half",
  "hall", "halt", "hand", "hang", "hare", "harm", "harp", "hash", "haste",
  "hate", "haul", "have", "haze", "hazy", "head", "heal", "heap", "hear",
  "heat", "heel", "held", "helm", "help", "herb", "herd", "here", "hero",
  "hide", "high", "hike", "hill", "hilt", "hind", "hint", "hire", "hive",
  "hold", "hole", "home", "hood", "hook", "hope", "horn", "host", "hour",
  "huge", "hull", "hump", "hunt", "hurt", "hymn", "icon", "idea", "idle",
  "inch", "info", "into", "iris", "iron", "isle", "item", "jack", "jade",
  "jake", "jazz", "jean", "jerk", "jest", "join", "joke", "josh", "jump",
  "june", "jury", "just", "keen", "keep", "kelp", "kept", "kick", "kind",
  "king", "kiss", "kite", "knit", "knob", "knot", "know", "lace", "lack",
  "laid", "lake", "lamb", "lamp", "land", "lane", "lark", "last", "late",
  "lawn", "lazy", "lead", "leaf", "lean", "leap", "left", "lend", "lens",
  "less", "lick", "life", "lift", "like", "lily", "limb", "lime", "limp",
  "line", "link", "lion", "list", "live", "load", "loaf", "loan", "lock",
  "loft", "logo", "long", "look", "loop", "lord", "lore", "lose", "loss",
  "lost", "lots", "loud", "love", "luck", "lull", "lump", "lure", "lurk",
  "lush", "luxe", "lynx", "lyric", "mace", "made", "mage", "maid", "mail",
  "main", "make", "male", "mall", "malt", "mane", "many", "mare", "mark",
  "mars", "mash", "mask", "mass", "mast", "mate", "maze", "mead", "meal",
  "mean", "meat", "meet", "meld", "melt", "memo", "mend", "menu", "mere",
  "mesa", "mesh", "mess", "mild", "mile", "milk", "mill", "mime", "mind",
  "mine", "mini", "mint", "miss", "mist", "mite", "moat", "mock", "mode",
  "mold", "monk", "mood", "moon", "moor", "more", "moss", "most", "moth",
  "move", "much", "muse", "mush", "must", "myth", "nail", "name", "navy",
  "near", "neat", "neck", "need", "nest", "next", "nice", "nick", "nine",
  "node", "none", "noon", "norm", "nose", "note", "noun", "nova", "nude",
  "null", "numb", "oath", "obey", "odds", "oink", "okay", "once", "only",
  "onto", "opal", "open", "orca", "oven", "over", "pace", "pack", "page",
  "paid", "pail", "pain", "pair", "pale", "palm", "pane", "papa", "park",
  "part", "pass", "past", "path", "peak", "pear", "peat", "peek", "peel",
  "peer", "pier", "pike", "pile", "pine", "pink", "pipe", "plan", "play",
  "plea", "plot", "plow", "ploy", "plug", "plum", "plus", "poem", "poet",
  "pole", "poll", "polo", "pond", "pony", "pool", "poor", "pope", "pore",
  "pork", "port", "pose", "post", "pour", "pray", "prey", "prop", "prow",
  "pull", "pulp", "pump", "punk", "pure", "push", "quiz", "race", "rack",
  "raft", "rage", "raid", "rail", "rain", "rake", "ramp", "rang", "rank",
  "rare", "rash", "rate", "rave", "rays", "read", "real", "reap", "rear",
  "reed", "reef", "reel", "rely", "rent", "rest", "rich", "ride", "rift",
  "rind", "ring", "riot", "rise", "risk", "road", "roam", "roar", "robe",
  "rock", "rode", "role", "roll", "roof", "room", "root", "rope", "rose",
  "rosy", "rove", "ruby", "rude", "ruin", "rule", "rush", "rust", "ruth",
  "sack", "safe", "saga", "sage", "said", "sail", "sake", "sale", "salt",
  "same", "sand", "sane", "sang", "save", "scan", "seal", "seam", "seat",
  "sect", "seed", "seek", "seem", "seen", "self", "sell", "semi", "send",
  "sent", "shed", "shin", "ship", "shoe", "shop", "shot", "show", "shut",
  "sick", "side", "sift", "sigh", "sign", "silk", "sill", "silo", "sing",
  "sink", "site", "size", "skim", "skin", "skip", "slab", "slag", "slam",
  "slap", "sled", "slew", "slid", "slim", "slip", "slit", "slot", "slow",
  "slug", "snap", "snip", "snow", "snug", "soak", "soap", "soar", "sock",
  "sofa", "soft", "soil", "sold", "sole", "solo", "some", "song", "soon",
  "sore", "sort", "soul", "sour", "span", "spar", "spec", "sped", "spin",
  "spit", "spot", "spur", "star", "stay", "stem", "step", "stew", "stir",
  "stop", "stub", "stud", "such", "suit", "sulk", "sung", "sunk", "sure",
  "surf", "swan", "swap", "swim", "swirl", "tail", "take", "tale", "talk",
  "tall", "tame", "tank", "tape", "task", "team", "tear", "teem", "tell",
  "tend", "tent", "term", "test", "text", "than", "that", "them", "then",
  "they", "thin", "this", "thou", "tick", "tide", "tidy", "tied", "tier",
  "tile", "till", "tilt", "time", "tiny", "tire", "toad", "toil", "told",
  "toll", "tomb", "tone", "took", "tool", "tops", "tore", "torn", "toss",
  "tour", "town", "trap", "tray", "tree", "trek", "trim", "trio", "trip",
  "trot", "true", "tube", "tuck", "tuft", "tuna", "tune", "turn", "turf",
  "twig", "twin", "type", "ugly", "undo", "unit", "unto", "upon", "urge",
  "used", "user", "vain", "vale", "vane", "vary", "vast", "veil", "vein",
  "vent", "verb", "very", "vest", "veto", "view", "vine", "void", "volt",
  "vote", "wade", "wage", "wail", "wait", "wake", "walk", "wall", "wand",
  "want", "ward", "warm", "warn", "warp", "wary", "wash", "vast", "wave",
  "wavy", "ways", "weak", "wear", "weed", "week", "weep", "weld", "well",
  "went", "were", "west", "what", "when", "whim", "whom", "wick", "wide",
  "wife", "wild", "will", "wilt", "wily", "wind", "wine", "wing", "wink",
  "wipe", "wire", "wise", "wish", "with", "woke", "wolf", "wood", "wool",
  "word", "wore", "work", "worm", "worn", "wove", "wrap", "wren", "yank",
  "yard", "yarn", "year", "yell", "yoga", "yoke", "your", "zeal", "zero",
  "zone", "zoom",

  // 5-letter
  "about", "above", "acres", "adapt", "admit", "adopt", "after", "again",
  "agent", "agree", "aisle", "alert", "alien", "align", "alive", "alley",
  "allow", "alloy", "alone", "along", "alpha", "alter", "ample", "angel",
  "angle", "angry", "anime", "ankle", "apart", "apple", "arena", "arise",
  "atlas", "attic", "audio", "avian", "avoid", "awake", "award", "aware",
  "azure", "badge", "basic", "basin", "basis", "batch", "beach", "begin",
  "being", "bench", "berry", "birth", "black", "blade", "blame", "bland",
  "blank", "blast", "blaze", "bleed", "blend", "bless", "blind", "bliss",
  "block", "blood", "bloom", "blown", "blues", "blunt", "board", "boast",
  "bonus", "boost", "bound", "brace", "brain", "brand", "brave", "bread",
  "break", "breed", "brick", "bride", "brief", "brine", "bring", "brink",
  "broad", "broke", "brook", "brown", "brush", "buddy", "budge", "build",
  "built", "bunch", "burst", "cabin", "cable", "candy", "cargo", "carry",
  "catch", "cause", "cedar", "chain", "chair", "chalk", "charm", "chart",
  "chase", "cheap", "check", "cheer", "chess", "chest", "chief", "child",
  "chill", "china", "chunk", "circa", "civic", "civil", "claim", "clash",
  "class", "clean", "clear", "clerk", "click", "cliff", "climb", "cling",
  "clock", "clone", "close", "cloth", "cloud", "coach", "coast", "coral",
  "count", "court", "cover", "crack", "craft", "crane", "crash", "crate",
  "crazy", "cream", "creek", "crest", "crisp", "cross", "crowd", "crown",
  "crush", "curve", "cycle", "daily", "dance", "delta", "depth", "derby",
  "digit", "diner", "disco", "dodge", "doubt", "dough", "draft", "drain",
  "drape", "dream", "dress", "drift", "drill", "drink", "drive", "drone",
  "eager", "eagle", "early", "earth", "eight", "elder", "elect", "elite",
  "ember", "empty", "enjoy", "enter", "entry", "equal", "equip", "erupt",
  "essay", "event", "every", "exact", "exalt", "exist", "extra", "fable",
  "facet", "faith", "fault", "feast", "fence", "ferry", "fetch", "fever",
  "fiber", "fibre", "field", "fifth", "fifty", "fight", "final", "first",
  "fixed", "flame", "flare", "flash", "flask", "fleet", "flesh", "flint",
  "float", "flock", "flood", "floor", "flora", "flour", "fluid", "flute",
  "focus", "foggy", "force", "forge", "forth", "forum", "found", "frame",
  "frank", "fresh", "front", "frost", "froze", "fruit", "funny", "gauge",
  "ghost", "giant", "given", "glare", "glass", "gleam", "glide", "globe",
  "glory", "gloss", "glove", "grace", "grade", "grain", "grand", "grant",
  "graph", "grasp", "grass", "grave", "great", "green", "greet", "grief",
  "grind", "groan", "groom", "gross", "group", "grove", "growl", "grown",
  "guard", "guess", "guest", "guide", "guild", "haiku", "happy", "haven",
  "heart", "heave", "hedge", "hello", "hence", "heron", "hinge", "hobby",
  "honey", "honor", "horse", "hotel", "house", "human", "humor", "hyper",
  "ideal", "image", "imply", "index", "indie", "inner", "input", "inter",
  "intro", "issue", "ivory", "jewel", "joint", "judge", "juice", "knack",
  "knock", "known", "label", "labor", "laser", "later", "laugh", "layer",
  "learn", "lease", "least", "leave", "legal", "lemon", "level", "lever",
  "light", "limit", "linen", "liner", "llama", "local", "lodge", "logic",
  "loose", "lotus", "lover", "lower", "loyal", "lucky", "lunar", "lunch",
  "macro", "magic", "maker", "manor", "maple", "march", "marsh", "match",
  "maxim", "mayor", "media", "mercy", "merge", "merit", "merry", "metal",
  "meter", "micro", "might", "minor", "minus", "mixed", "model", "money",
  "month", "moral", "morph", "motor", "mount", "mouse", "mouth", "movie",
  "multi", "mural", "music", "naive", "nerve", "never", "night", "noble",
  "noise", "north", "noted", "novel", "nurse", "nylon", "occur", "ocean",
  "offer", "olive", "omega", "onset", "opera", "orbit", "order", "other",
  "ought", "outer", "ocean", "oxide", "ozone", "paint", "panel", "paper",
  "party", "pasta", "patch", "pause", "peace", "peach", "pearl", "pedal",
  "penny", "perch", "phase", "phone", "photo", "piano", "piece", "pilot",
  "pinch", "pixel", "pizza", "place", "plain", "plane", "plant", "plate",
  "plaza", "plead", "pluck", "plumb", "plume", "plush", "point", "polar",
  "porch", "pouch", "pound", "power", "press", "price", "pride", "prime",
  "print", "prior", "prize", "probe", "proof", "proud", "prove", "proxy",
  "psalm", "pulse", "pupil", "purse", "quest", "queue", "quick", "quiet",
  "quota", "quote", "radar", "radio", "raise", "rally", "ranch", "range",
  "rapid", "ratio", "reach", "react", "ready", "realm", "rebel", "refer",
  "reign", "relax", "relay", "renew", "repay", "reply", "rider", "ridge",
  "rifle", "right", "rigid", "risen", "rival", "river", "robin", "robot",
  "rocky", "rough", "round", "route", "royal", "rugby", "rural", "rusty",
  "saint", "salad", "salon", "sauce", "savor", "scale", "scene", "scent",
  "scope", "scout", "scrub", "serve", "seven", "shade", "shaft", "shake",
  "shall", "shame", "shape", "share", "shark", "sharp", "shave", "shear",
  "sheen", "sheep", "sheer", "sheet", "shelf", "shell", "shift", "shire",
  "shirt", "shock", "shore", "short", "shout", "shown", "shrub", "sight",
  "sigma", "since", "sixth", "sixty", "skill", "slate", "sleep", "slice",
  "slide", "slope", "small", "smart", "smell", "smile", "smoke", "snack",
  "solar", "solid", "solve", "sonic", "south", "space", "spare", "spark",
  "speak", "speed", "spell", "spend", "spent", "spice", "spine", "spoke",
  "spoon", "sport", "spray", "stack", "staff", "stage", "stake", "stale",
  "stall", "stamp", "stand", "start", "state", "stave", "stays", "steak",
  "steal", "steam", "steel", "steep", "steer", "stern", "stick", "still",
  "stock", "stone", "stood", "stool", "store", "storm", "story", "stout",
  "stove", "strap", "straw", "stray", "strip", "stuck", "study", "stuff",
  "stump", "style", "sugar", "suite", "sunny", "super", "surge", "swamp",
  "swarm", "sweet", "swept", "swift", "swing", "sword", "swore", "sworn",
  "table", "taste", "teach", "teeth", "tempo", "tenor", "thank", "theme",
  "thick", "thing", "think", "third", "thorn", "those", "three", "throw",
  "thumb", "tiger", "tight", "timer", "title", "toast", "today", "token",
  "topic", "torch", "total", "touch", "tough", "towel", "tower", "toxic",
  "trace", "track", "trade", "trail", "train", "trait", "trash", "treat",
  "trend", "trial", "tribe", "trick", "tried", "troop", "trout", "truck",
  "truly", "trunk", "trust", "truth", "tumor", "twice", "twist", "ultra",
  "under", "union", "unite", "unity", "until", "upper", "upset", "urban",
  "usage", "usual", "utter", "valid", "valor", "value", "vapor", "vault",
  "venue", "verse", "vigor", "viral", "virus", "visit", "vista", "vital",
  "vivid", "vocal", "voice", "voter", "vouch", "watch", "water", "weave",
  "wedge", "weigh", "weird", "whale", "wheat", "wheel", "where", "which",
  "while", "white", "whole", "whose", "wider", "width", "wired", "witch",
  "woman", "world", "worry", "worse", "worst", "worth", "would", "wound",
  "wrist", "write", "wrong", "wrote", "yacht", "yield", "young", "youth",

  // 6+ letter — common in brand domains
  "access", "active", "actual", "anchor", "annual", "appeal", "arctic",
  "basket", "beacon", "beauty", "beyond", "bitter", "borrow", "bottle",
  "bounce", "branch", "breeze", "bridge", "bright", "bronze", "budget",
  "bundle", "butter", "canvas", "carbon", "castle", "center", "centre",
  "change", "choice", "circle", "cipher", "citrus", "classic", "clever",
  "client", "cobalt", "coffee", "colony", "colour", "coming", "common",
  "copper", "corner", "cosmic", "cotton", "course", "covers", "create",
  "credit", "cruise", "custom", "dapper", "decade", "define", "dental",
  "design", "detail", "device", "dialog", "direct", "divine", "double",
  "dragon", "driven", "driver", "dynamo", "eating", "effect", "effort",
  "empire", "enable", "energy", "engine", "ensure", "entire", "estate",
  "evolve", "expert", "export", "fabric", "factor", "falcon", "family",
  "farmer", "father", "feline", "figure", "filter", "finder", "finger",
  "finish", "floral", "flower", "flying", "follow", "forest", "formal",
  "former", "foster", "frozen", "fusion", "future", "gadget", "galaxy",
  "gaming", "garden", "gather", "gentle", "ginger", "global", "golden",
  "gravel", "ground", "growth", "guitar", "gutter", "harbor", "health",
  "hearth", "hidden", "hiking", "hollow", "honest", "horizon", "house",
  "humble", "hybrid", "impact", "import", "indoor", "inform", "inland",
  "insert", "inside", "invest", "island", "jungle", "junior", "knight",
  "ladder", "lambda", "launch", "leader", "legacy", "legend", "lender",
  "lesson", "letter", "lights", "likely", "linear", "lively", "living",
  "luxury", "magnet", "maiden", "mango", "manner", "marble", "margin",
  "marine", "market", "master", "matter", "meadow", "medium", "melody",
  "member", "memory", "mental", "mentor", "method", "middle", "mighty",
  "mingle", "mirror", "mobile", "modern", "modest", "monkey", "mortar",
  "motion", "mother", "moving", "museum", "mutual", "narrow", "nation",
  "native", "nature", "nimble", "normal", "notice", "notion", "number",
  "object", "obtain", "office", "online", "option", "orange", "origin",
  "output", "oxygen", "oyster", "pacific", "paddle", "palace", "parcel",
  "parent", "patron", "pebble", "people", "pepper", "period", "person",
  "pillar", "planet", "player", "pledge", "plenty", "pocket", "poetry",
  "polish", "portal", "potato", "powder", "praxis", "prayer", "prefer",
  "pretty", "prince", "profit", "proper", "public", "pursue", "puzzle",
  "quartz", "rabbit", "radius", "random", "rather", "reason", "recipe",
  "record", "reduce", "reform", "region", "relief", "remote", "remove",
  "render", "rental", "repair", "repeat", "report", "rescue", "resort",
  "result", "retail", "retain", "reveal", "review", "ribbon", "riddle",
  "ripple", "ritual", "robust", "rocket", "rugged", "rustic", "safari",
  "safety", "salary", "salmon", "sample", "scroll", "search", "season",
  "second", "sector", "secure", "select", "senior", "series", "server",
  "settle", "shadow", "shield", "signal", "silver", "simple", "sketch",
  "social", "socket", "soften", "source", "sphere", "spider", "spirit",
  "splash", "spring", "square", "stable", "status", "steady", "stream",
  "street", "strict", "stride", "strike", "string", "strong", "studio",
  "submit", "subtle", "sudden", "summit", "sunset", "supply", "switch",
  "symbol", "system", "talent", "target", "temple", "tenant", "tender",
  "thread", "thrive", "throne", "timber", "tissue", "toggle", "tomato",
  "tongue", "toward", "travel", "treaty", "tribal", "trophy", "tunnel",
  "turtle", "twelve", "unique", "united", "unlock", "update", "upward",
  "valley", "velvet", "vendor", "venture", "vessel", "viewer", "violet",
  "virtue", "vision", "voyage", "walker", "wander", "wealth", "weekly",
  "weight", "window", "winter", "wisdom", "wonder", "worthy", "yellow",

  // 7+ letter — common brand words
  "academy", "account", "achieve", "address", "advance", "adventure",
  "amazing", "ancient", "another", "balance", "banking", "because",
  "believe", "benefit", "between", "billing", "blossom", "booking",
  "booster", "brewing", "brother", "builder", "cabinet", "caliber",
  "camping", "capital", "capture", "careful", "catalog", "central",
  "chamber", "chapter", "charter", "chicken", "classic", "climate",
  "closing", "cluster", "coastal", "collect", "college", "comfort",
  "command", "company", "compass", "complex", "concept", "concern",
  "connect", "consult", "contain", "content", "context", "control",
  "convert", "cooking", "counsel", "counter", "country", "courage",
  "created", "creator", "crystal", "culture", "current", "decimal",
  "declare", "defense", "deliver", "diamond", "digital", "diploma",
  "discard", "display", "distant", "diverse", "dolphin", "dynamic",
  "eastern", "economy", "edition", "educate", "element", "elevate",
  "embrace", "emerald", "emotion", "empower", "endless", "enforce",
  "enhance", "ethical", "evening", "evident", "examine", "example",
  "execute", "expense", "explore", "express", "extreme", "fashion",
  "feeling", "fiction", "finance", "fitness", "flannel", "flicker",
  "flutter", "forever", "formula", "fortune", "forward", "founder",
  "freedom", "freight", "fulfill", "further", "general", "genuine",
  "glimpse", "granite", "graphic", "gravity", "grocery", "growing",
  "habitat", "handful", "handler", "harbour", "harmony", "harvest",
  "heading", "healthy", "helpful", "highway", "history", "holding",
  "holiday", "horizon", "housing", "hundred", "imagine", "immerse",
  "initial", "insight", "inspect", "install", "instant", "instead",
  "integer", "interim", "intrude", "inverse", "involve", "iterate",
  "journal", "journey", "justice", "keynote", "kitchen", "kingdom",
  "landing", "largely", "lateral", "leather", "lending", "liberty",
  "library", "limited", "listing", "logical", "machine", "manager",
  "mapping", "masonry", "maximum", "measure", "medical", "meeting",
  "mineral", "minimum", "miracle", "mission", "mixture", "monitor",
  "monthly", "morning", "movable", "natural", "nearest", "network",
  "neutral", "notable", "nothing", "nowhere", "nuclear", "nurture",
  "obvious", "officer", "opening", "operate", "opinion", "optimal",
  "organic", "origami", "outdoor", "outline", "outlook", "overall",
  "overlay", "overtop", "package", "parking", "partial", "partner",
  "passage", "passion", "patient", "pattern", "payment", "pendant",
  "pension", "percent", "perfect", "persist", "picture", "pioneer",
  "plastic", "platter", "popular", "portion", "pottery", "poultry",
  "powered", "premium", "prepare", "present", "prevent", "primary",
  "privacy", "private", "problem", "proceed", "produce", "product",
  "profile", "program", "project", "promise", "promote", "protein",
  "provide", "publish", "purpose", "pursuit", "qualify", "quality",
  "quarter", "quickly", "radical", "rainbow", "realize", "receipt",
  "recover", "recycle", "redwood", "refined", "regular", "related",
  "release", "reliable", "remains", "renewal", "replace", "replica",
  "request", "require", "reserve", "resolve", "respect", "respond",
  "restore", "retreat", "revenue", "routine", "sailing", "sandbox",
  "satisfy", "scholar", "science", "seafood", "shelter", "shutter",
  "silicon", "society", "solaris", "species", "sponsor", "stellar",
  "storage", "stratum", "stretch", "subject", "success", "suggest",
  "summary", "support", "surface", "surplus", "sustain", "synergy",
  "therapy", "thought", "through", "thunder", "tourism", "traffic",
  "trading", "trainer", "transit", "trusted", "uniform", "upgrade",
  "variety", "venture", "version", "veteran", "virtual", "weather",
  "website", "welcome", "welfare", "western", "whisper", "whistle",
  "wildcat", "without", "working", "writing",

  // 8+ letter — professional/industry terms common in business domains
  "absolute", "abstract", "academic", "accurate", "activity", "advocate",
  "alliance", "although", "analysis", "anywhere", "appliance", "approach",
  "artifact", "assembly", "backyard", "bathroom", "becoming", "behavior",
  "birthday", "breaking", "breeding", "business", "calendar", "campaign",
  "cardinal", "catering", "cellular", "champion", "children", "cleaning",
  "climbing", "clothing", "coaching", "colossus", "combined", "commerce",
  "communal", "complete", "compound", "computer", "concrete", "confetti",
  "confused", "consider", "constant", "consumer", "continue", "contract",
  "cookbook", "coverage", "creative", "criminal", "crossing", "currency",
  "customer", "database", "daughter", "daylight", "deciding", "deckhand",
  "december", "decision", "decorate", "decrease", "delivery", "describe",
  "designer", "detailed", "detector", "develop", "dialogue", "dinosaur",
  "diplomat", "disabled", "discount", "discover", "dispatch", "distance",
  "district", "document", "domestic", "dominant", "doorstep", "doorways",
  "download", "dramatic", "dressing", "drinking", "driveway", "dropping",
  "dynamics", "earnings", "economic", "educated", "educator", "election",
  "electric", "electron", "elegance", "elevated", "elephant", "embedded",
  "emerging", "emission", "employee", "empowered", "engineer", "enormous",
  "ensemble", "entirely", "envelope", "environ", "equality", "equation",
  "equipped", "espresso", "estimate", "evaluate", "eventual", "everybody",
  "evidence", "exchange", "exciting", "exercise", "existing", "expected",
  "expedite", "expenses", "explicit", "explorer", "exponent", "exposure",
  "extended", "external", "eyebrows", "facebook", "facility", "familiar",
  "favorite", "featured", "feedback", "festival", "fidelity", "figurine",
  "filament", "filmmaker", "financial", "finisher", "fireside", "firmware",
  "flagship", "flexible", "flourish", "footwear", "forecast", "forensic",
  "forester", "formally", "formerly", "founding", "fountain", "fragment",
  "freehold", "freelance", "friendly", "frontier", "fruitful", "function",
  "galactic", "gambling", "generate", "generous", "genetics", "goldfish",
  "goodness", "gorgeous", "governor", "graceful", "gradient", "graduate",
  "graphics", "grateful", "guardian", "guidance", "gunsmith", "handbook",
  "handling", "handmade", "handsome", "happened", "hardware", "harmonic",
  "headline", "headroom", "heritage", "highland", "historic", "homework",
  "honestly", "hospital", "hostname", "humanist", "humanity", "hydrogen",
  "identity", "ignorant", "illumine", "imaging", "imminent", "imperial",
  "imported", "improved", "incident", "included", "increase", "indicate",
  "indirect", "industry", "infinite", "informal", "informed", "infrared",
  "inherent", "innocent", "innovate", "instinct", "intended", "interact",
  "interest", "interior", "internal", "internet", "intimate", "inviting",
  "isolated", "jonathan", "keyboard", "kindness", "kingfish", "knockout",
  "labeling", "lakeview", "landmark", "language", "lavender", "learning",
  "leverage", "lifeline", "lifetime", "lighting", "likewise", "literary",
  "location", "lockdown", "lockstep", "longhorn", "longtail", "loveseat",
  "machines", "magnetic", "mainland", "maintain", "makeover", "manifest",
  "marathon", "markdown", "material", "maximize", "measured", "mechanic",
  "medicine", "memorial", "merchant", "midnight", "military", "millwork",
  "minimize", "minister", "minority", "moderate", "molecule", "momentum",
  "monetary", "monopoly", "mortgage", "mountain", "movement", "multiply",
  "mushroom", "mustache", "national", "navigate", "negative", "neighbor",
  "nominate", "notebook", "november", "numerous", "nurturing", "nutrient",
  "obscured", "obsolete", "obtained", "occasion", "occupied", "offering",
  "official", "offshore", "operator", "opponent", "opposite", "optimism",
  "optional", "ordinary", "organism", "organize", "oriental", "original",
  "orphaned", "orthodox", "outreach", "overcome", "overhead", "overlook",
  "overtime", "overview", "owership", "painting", "pamphlet", "panorama",
  "paradise", "parallel", "parenting", "passport", "pastoral", "patience",
  "peculiar", "pedagogy", "pedestal", "perceive", "periodic", "personal",
  "petition", "pharmacy", "physical", "piloting", "pinpoint", "pipeline",
  "platform", "pleasant", "pleasure", "plethora", "plumbing", "podcasts",
  "pointing", "polished", "politics", "populace", "populate", "portrait",
  "position", "positive", "possible", "postcard", "potatoes", "potently",
  "powerful", "practice", "precious", "predator", "pregnant", "premiere",
  "prepared", "preserve", "prestige", "prettify", "previous", "princess",
  "printing", "pristine", "probably", "proceeds", "producer", "profound",
  "programs", "progress", "prolific", "properly", "property", "proposal",
  "prospect", "protocol", "provider", "province", "provoked", "prudence",
  "purchase", "pursuing",
  "quarters", "question",
  "radiance", "railroad", "raincoat", "randomly", "rational", "readable",
  "received", "recently", "redesign", "redirect", "referral", "regional",
  "register", "regulate", "reinvent", "relation", "relative", "relevant",
  "reliably", "relocate", "remember", "reminder", "renowned", "repeater",
  "reporter", "required", "research", "resident", "resigned", "resource",
  "response", "restless", "retailer", "retrieve", "returned", "reviewer",
  "revision", "rigorous", "roadster", "romantic", "rooftops", "rotating",
  "sandwich", "sapphire", "saturday", "scaffold", "scenario", "schedule",
  "scissors", "scouting", "sculptor", "seasonal", "security", "sediment",
  "selector", "semester", "seminary", "sensible", "sentence", "separate",
  "sequence", "sergeant", "services", "sessions", "shipping", "shopping",
  "shoulder", "shutdown", "sideline", "sidewalk", "simplify", "singular",
  "skeleton", "sketches", "skillful", "sleeping", "slightly", "smallest",
  "snapshot", "snowbird", "snowfall", "socially", "software", "solitary",
  "solution", "somebody", "somewhat", "southern", "souvenir", "spacious",
  "speaking", "specific", "spending", "spinster", "sporting", "spotless",
  "squirrel", "standard", "standing", "starting", "statutes", "stepping",
  "sterling", "stimulus", "stockade", "stopping", "straight", "stranger",
  "strategy", "strength", "stressed", "striking", "stronger", "strongly",
  "struggle", "stunning", "suburban", "suddenly", "suffrage", "suitcase",
  "sunlight", "sunshine", "superior", "supplier", "supposed", "surround",
  "survival", "survivor", "suspense", "sustains", "sweeping", "symbolic",
  "symmetry", "sympathy", "takeaway", "tangible", "taxation", "teaching",
  "teammate", "teamwork", "template", "temporal", "terminal", "terrible",
  "thankful", "thirteen", "thorough", "thriller", "thriving", "together",
  "tomorrow", "tracking", "training", "transfer", "treasure", "trending",
  "triangle", "tribunal", "tropical", "truthful", "tungsten", "tutoring",
  "tweeting", "twilight", "ultimate", "umbrella", "uncommon", "underdog",
  "underway", "unlikely", "uncommon", "universe", "unpacked", "unsigned",
  "upstairs", "upstream", "validate", "valuable", "variable", "vehicles",
  "ventures", "vertical", "veterans", "vicinity", "viewport", "violence",
  "volcanic", "vortices", "warranty", "watchful", "waterway", "waveform",
  "weakness", "weekdays", "whenever", "wherever", "wildfire", "wildflower",
  "wireless", "withdraw", "woodland", "workshop", "yearbook", "yourself",
  // Common compound words that should NOT be split
  "sunflower", "moonlight", "starlight", "daylight", "spotlight", "flashlight",
  "footprint", "doorstep", "blueprint", "blackberry", "blueberry", "strawberry",
  "raspberry", "pineapple", "grapefruit", "waterfall", "waterfront", "seashore",
  "shoreline", "coastline", "treehouse", "farmhouse", "warehouse", "penthouse",
  "firehouse", "birdhouse", "lighthouse", "horseback", "horseshoe", "snowflake",
  "raindrop", "thunderstorm", "windmill", "sawmill", "textbook", "notebook",
  "bookshelf", "bookstore", "bookkeeper", "doorbell", "eggshell", "nutshell",
  "seashell", "eyelash", "backpack", "backyard", "background", "basketball",
  "barefoot", "bedrock", "bedroom", "birthplace", "blackout", "blacksmith",
  "brainstorm", "breakaway", "breakdown", "breakthrough", "broadcast",
  "buttercup", "butterfly", "campfire", "candlelight", "cardboard", "carefree",
  "carpool", "classmate", "clockwork", "cobblestone", "comeback", "copyright",
  "cornfield", "countdown", "courtyard", "crossroad", "cupboard", "daydream",
  "deadline", "dishwasher", "driftwood", "dragonfly", "earthquake", "evergreen",
  "everyone", "everything", "everywhere", "eyebrow", "fingertip", "firewood",
  "fireplace", "fisherman", "flashback", "footstep", "forehead", "framework",
  "frostbite", "gentleman", "grassland", "graveyard", "groundwork", "haircut",
  "halfway", "hallmark", "handcraft", "handshake", "hardwood", "headquarters",
  "heartbeat", "heartland", "heatwave", "highland", "hilltop", "homemade",
  "homestead", "honeybee", "horseback", "household", "housekeeper", "iceberg",
  "innermost", "ironwork", "keystone", "lakeside", "landscape", "limestone",
  "limelight", "livestock", "locksmith", "longbow", "marketplace", "masterpiece",
  "matchstick", "meanwhile", "midsummer", "milestone", "moonbeam", "moreover",
  "motorcycle", "namesake", "network", "newborn", "nightfall", "nightmare",
  "otherwise", "outskirts", "overcome", "paperwork", "patchwork", "paycheck",
  "peacetime", "pinecone", "pitchfork", "playground", "popcorn", "postmark",
  "quicksand", "rainstorm", "rattlesnake", "riverbank", "roadblock", "rooftop",
  "rosebud", "rosemary", "safeguard", "sandcastle", "sandstone", "sawdust",
  "scarecrow", "scoreboard", "shipwreck", "shortcut", "sidetrack", "silversmith",
  "skateboard", "slowdown", "snowbird", "snowstorm", "softball", "somewhere",
  "soundproof", "spearmint", "standpoint", "steamboat", "stepladder", "stockpile",
  "stonework", "stopwatch", "storeroom", "storyline", "strawberry", "stronghold",
  "sunbeam", "sunburn", "sundial", "sunlight", "sunscreen", "sunrise", "sunset",
  "sunshine", "swordfish", "tailgate", "taskmaster", "teaspoon", "textbook",
  "tightrope", "timberland", "timestamp", "touchstone", "trademark", "trailblazer",
  "treadmill", "turnpike", "turntable", "typewriter", "undercover", "underground",
  "underscore", "upholstery", "viewpoint", "volleyball", "wallpaper",
  "watercolor", "waterfront", "watermark", "waterproof", "wavelength",
  "whirlwind", "wholesale", "windshield", "woodcraft", "woodpecker", "woodwork",
  "workbench", "workforce", "workplace",

  // Professional terms that appear in service-industry domains
  "psychiatrist", "psychologist", "counselor", "therapist", "dentist",
  "attorney", "consultant", "accountant", "architect", "mechanic",
  "plumber", "electrician", "contractor", "realtor", "counseling",
  "pediatric", "orthopedic", "chiropractic", "dermatology", "oncology",
  "veterinary", "specialist", "management", "consulting", "accounting",
  "engineering", "marketing", "advertising", "photography", "landscaping",
  "construction", "renovation", "restoration", "demolition", "excavation",
  "automotive", "insurance",
]);

// ─── Splitting Logic ─────────────────────────────────────────────────────

/**
 * Try to split a lower-cased stem into known words using dynamic
 * programming (shortest-remainder-first).  Returns the split words
 * or null if no clean split covers the entire stem.
 */
function dpSplit(stem: string): string[] | null {
  const n = stem.length;
  // dp[i] = list of words that cover stem[0..i)
  const dp: (string[] | null)[] = new Array(n + 1).fill(null);
  dp[0] = [];

  for (let i = 0; i < n; i++) {
    if (dp[i] === null) continue;
    // Try every word length from 2..remaining
    for (let len = 2; len <= n - i; len++) {
      const word = stem.substring(i, i + len);
      if (WORD_LIST.has(word)) {
        const candidate = [...dp[i]!, word];
        // Pick the split that uses fewer, longer words (prefer fewer segments)
        if (dp[i + len] === null || candidate.length < dp[i + len]!.length) {
          dp[i + len] = candidate;
        }
      }
    }
  }

  return dp[n];
}

/**
 * Derive a human-readable brand name from a URL.
 *
 * 1. Extract the domain stem (hostname minus www. and TLD)
 * 2. Handle hyphens → spaces
 * 3. Handle camelCase → word boundaries
 * 4. Dictionary-based word splitting for concatenated stems
 * 5. Title-case the result
 *
 * Returns null if the stem is empty or too short (< 2 chars).
 */
export function nameFromDomain(url: string): string | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }

  // Remove www. prefix
  hostname = hostname.replace(/^www\./i, "");

  // Take the part before the first dot (domain stem)
  const stem = hostname.split(".")[0];
  if (!stem || stem.length < 2) return null;

  // Strip trailing digits (e.g. "brand123" → "brand")
  const cleaned = stem.replace(/\d+$/, "");
  if (!cleaned || cleaned.length < 2) return null;

  // ── Step 1: Split on hyphens ──
  if (cleaned.includes("-")) {
    const parts = cleaned
      .split("-")
      .filter((p) => p.length > 0)
      .map(titleCase);
    if (parts.length > 0) return parts.join(" ");
  }

  // ── Step 2: Split on camelCase boundaries ──
  // e.g. "myWebsite" → ["my", "Website"]
  const camelParts = cleaned.split(/(?<=[a-z])(?=[A-Z])/);
  if (camelParts.length >= 2) {
    return camelParts.map(titleCase).join(" ");
  }

  // ── Step 3: Dictionary-based word splitting ──
  const lower = cleaned.toLowerCase();

  // If the entire stem is already a known word, keep it intact.
  // Prevents splitting "facebook" → "Face Book", "sunflower" → "Sun Flower".
  if (WORD_LIST.has(lower)) {
    return titleCase(cleaned);
  }

  const words = dpSplit(lower);
  if (words && words.length >= 2 && words.length <= 4) {
    return words.map(titleCase).join(" ");
  }

  // ── Step 4: Fallback — title-case the raw stem ──
  return titleCase(cleaned);
}

function titleCase(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
