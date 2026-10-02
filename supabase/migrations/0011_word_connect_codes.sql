-- Connect codes become three words.
--
-- `mint_connect_token` used to return 32 random bytes as base64url: 43
-- characters of the form `xQ8-tZ...`. That is fine for a QR code and useless
-- for a person, and the typed path is the one people fall back to when a camera
-- fails. So a code is now three words -- a physical adjective, a personality
-- adjective and an animal -- joined with hyphens:
--
--     brisk-stubborn-otter
--
-- Readable across a noisy room, typeable in a few seconds, and hard to mishear.
--
-- ---------------------------------------------------------------------------
-- How much entropy this costs, and why it is survivable
-- ---------------------------------------------------------------------------
--
-- The lists hold 305, 275 and 323 words, so a code is one of
--
--     305 x 275 x 323 = 27,091,625 combinations
--
-- which is about 2^24. The old token was 256 bits. That is a real
-- reduction and it has to be priced rather than waved through.
--
-- What a guessed code actually buys an attacker: a confirmation prompt on
-- someone's phone, naming the attacker. It shares nothing. `confirm_exchange`
-- is untouched, both people still have to tap confirm inside thirty seconds,
-- and the second confirmation is what creates anything. **The token has never
-- been the consent boundary. The mutual confirmation is.** This is the same
-- residual risk already written down for the nearby path in 0005.
--
-- But a plausible prompt from a stranger is still worth something to an
-- attacker, so guessing is rate limited below. With 305 x 275 x 323
-- combinations, a 120 second lifetime, single use, and a cap of a handful of
-- wrong guesses per minute, the chance of landing on a specific live code is
-- negligible, and the cost of trying is a row in a table that gets swept.
--
-- ---------------------------------------------------------------------------
-- The word lists
-- ---------------------------------------------------------------------------
--
-- Rules they were built to, all enforced by a test rather than remembered:
--
--   * lowercase a-z only, three to eight characters -- this gets typed on a
--     phone keyboard
--   * no homophones or near-homophones anywhere in the set. Not bear/bare, not
--     hare/hair, not moose/mousse. The code gets read aloud, so a pair that
--     sounds alike is a pair of failed connections
--   * no word appears in two lists, so a code's shape never becomes ambiguous
--   * nothing profane, nothing medical, nothing frightening, and nothing about
--     bodies. "Physical" here means the texture and colour of things -- glossy,
--     pebbly, russet -- never a description of the person holding the phone
--
-- They live in a table rather than in arrays inside the function so they can be
-- queried, counted and tested, and so a word can be removed without rewriting
-- a function.

create table public.connect_words (
  kind text not null check (kind in ('physical', 'personality', 'animal')),
  word text not null check (word ~ '^[a-z]{3,8}$'),
  primary key (kind, word)
);

comment on table public.connect_words is
  'The vocabulary connect codes are built from. One word per row, grouped by the position it fills: physical adjective, personality adjective, animal.';

-- A word must not appear in two lists: it would make a code ambiguous to read
-- back, and it would skew which list a guess should target.
create unique index connect_words_word_unique on public.connect_words (word);

insert into public.connect_words (kind, word) values
  ('physical', 'airy'),
  ('physical', 'amber'),
  ('physical', 'ample'),
  ('physical', 'anchored'),
  ('physical', 'arched'),
  ('physical', 'auburn'),
  ('physical', 'azure'),
  ('physical', 'balmy'),
  ('physical', 'beaded'),
  ('physical', 'beige'),
  ('physical', 'bendy'),
  ('physical', 'blotchy'),
  ('physical', 'bobbing'),
  ('physical', 'bouncing'),
  ('physical', 'boxy'),
  ('physical', 'braided'),
  ('physical', 'brassy'),
  ('physical', 'breezy'),
  ('physical', 'bright'),
  ('physical', 'brisk'),
  ('physical', 'bristly'),
  ('physical', 'brittle'),
  ('physical', 'brocade'),
  ('physical', 'bubbling'),
  ('physical', 'bubbly'),
  ('physical', 'bulky'),
  ('physical', 'bumpy'),
  ('physical', 'burlap'),
  ('physical', 'buzzing'),
  ('physical', 'canvas'),
  ('physical', 'carved'),
  ('physical', 'chalky'),
  ('physical', 'chewy'),
  ('physical', 'chilly'),
  ('physical', 'chiming'),
  ('physical', 'chunky'),
  ('physical', 'cindery'),
  ('physical', 'clayey'),
  ('physical', 'clinking'),
  ('physical', 'cloudy'),
  ('physical', 'coarse'),
  ('physical', 'cobbled'),
  ('physical', 'coiled'),
  ('physical', 'compact'),
  ('physical', 'coppery'),
  ('physical', 'corky'),
  ('physical', 'cotton'),
  ('physical', 'cramped'),
  ('physical', 'creaking'),
  ('physical', 'creamy'),
  ('physical', 'crimson'),
  ('physical', 'crinkled'),
  ('physical', 'crisp'),
  ('physical', 'crumpled'),
  ('physical', 'crunchy'),
  ('physical', 'crusty'),
  ('physical', 'curdled'),
  ('physical', 'curly'),
  ('physical', 'curved'),
  ('physical', 'damp'),
  ('physical', 'dappled'),
  ('physical', 'darting'),
  ('physical', 'denim'),
  ('physical', 'dented'),
  ('physical', 'dewy'),
  ('physical', 'dimpled'),
  ('physical', 'dotted'),
  ('physical', 'downy'),
  ('physical', 'drifting'),
  ('physical', 'dusky'),
  ('physical', 'dusty'),
  ('physical', 'earthen'),
  ('physical', 'ebony'),
  ('physical', 'elastic'),
  ('physical', 'emerald'),
  ('physical', 'etched'),
  ('physical', 'faded'),
  ('physical', 'feathery'),
  ('physical', 'fibrous'),
  ('physical', 'fizzy'),
  ('physical', 'flaky'),
  ('physical', 'flickery'),
  ('physical', 'flinty'),
  ('physical', 'floating'),
  ('physical', 'fluffy'),
  ('physical', 'fluted'),
  ('physical', 'foamy'),
  ('physical', 'foggy'),
  ('physical', 'folded'),
  ('physical', 'frilly'),
  ('physical', 'fringed'),
  ('physical', 'frosted'),
  ('physical', 'frosty'),
  ('physical', 'frozen'),
  ('physical', 'furry'),
  ('physical', 'fuzzy'),
  ('physical', 'gauzy'),
  ('physical', 'giant'),
  ('physical', 'gilded'),
  ('physical', 'glacial'),
  ('physical', 'glassy'),
  ('physical', 'gliding'),
  ('physical', 'glinting'),
  ('physical', 'glossy'),
  ('physical', 'glowing'),
  ('physical', 'glowy'),
  ('physical', 'gnarled'),
  ('physical', 'golden'),
  ('physical', 'grainy'),
  ('physical', 'granite'),
  ('physical', 'gritty'),
  ('physical', 'grooved'),
  ('physical', 'hanging'),
  ('physical', 'hazy'),
  ('physical', 'hefty'),
  ('physical', 'hempen'),
  ('physical', 'hollow'),
  ('physical', 'humid'),
  ('physical', 'humming'),
  ('physical', 'indigo'),
  ('physical', 'inky'),
  ('physical', 'ivory'),
  ('physical', 'jade'),
  ('physical', 'jagged'),
  ('physical', 'jingling'),
  ('physical', 'jumbo'),
  ('physical', 'knitted'),
  ('physical', 'knobby'),
  ('physical', 'knotty'),
  ('physical', 'lacy'),
  ('physical', 'lanky'),
  ('physical', 'leafy'),
  ('physical', 'leaning'),
  ('physical', 'leathery'),
  ('physical', 'level'),
  ('physical', 'lilac'),
  ('physical', 'limber'),
  ('physical', 'linen'),
  ('physical', 'loamy'),
  ('physical', 'lofty'),
  ('physical', 'looping'),
  ('physical', 'lumpy'),
  ('physical', 'marble'),
  ('physical', 'marbled'),
  ('physical', 'matte'),
  ('physical', 'mauve'),
  ('physical', 'melted'),
  ('physical', 'misty'),
  ('physical', 'molten'),
  ('physical', 'moored'),
  ('physical', 'mossy'),
  ('physical', 'mottled'),
  ('physical', 'murky'),
  ('physical', 'muslin'),
  ('physical', 'narrow'),
  ('physical', 'nimble'),
  ('physical', 'nippy'),
  ('physical', 'notched'),
  ('physical', 'nubbly'),
  ('physical', 'oaken'),
  ('physical', 'ochre'),
  ('physical', 'opaque'),
  ('physical', 'oval'),
  ('physical', 'padded'),
  ('physical', 'papery'),
  ('physical', 'peach'),
  ('physical', 'pearly'),
  ('physical', 'peaty'),
  ('physical', 'pebbly'),
  ('physical', 'petite'),
  ('physical', 'pitted'),
  ('physical', 'planted'),
  ('physical', 'pleated'),
  ('physical', 'pliant'),
  ('physical', 'plush'),
  ('physical', 'polished'),
  ('physical', 'porous'),
  ('physical', 'powdery'),
  ('physical', 'prickly'),
  ('physical', 'puckered'),
  ('physical', 'quartz'),
  ('physical', 'quilted'),
  ('physical', 'ribbed'),
  ('physical', 'ridged'),
  ('physical', 'rigid'),
  ('physical', 'rippling'),
  ('physical', 'rising'),
  ('physical', 'rocky'),
  ('physical', 'rolling'),
  ('physical', 'roomy'),
  ('physical', 'rooted'),
  ('physical', 'rounded'),
  ('physical', 'rubbery'),
  ('physical', 'ruffled'),
  ('physical', 'rugged'),
  ('physical', 'rumpled'),
  ('physical', 'russet'),
  ('physical', 'rustling'),
  ('physical', 'rusty'),
  ('physical', 'sagging'),
  ('physical', 'salty'),
  ('physical', 'sandy'),
  ('physical', 'satin'),
  ('physical', 'scaly'),
  ('physical', 'scant'),
  ('physical', 'scarlet'),
  ('physical', 'scuffed'),
  ('physical', 'sepia'),
  ('physical', 'shady'),
  ('physical', 'shaggy'),
  ('physical', 'sheeny'),
  ('physical', 'sheer'),
  ('physical', 'shimmer'),
  ('physical', 'shiny'),
  ('physical', 'silken'),
  ('physical', 'silky'),
  ('physical', 'silted'),
  ('physical', 'silvery'),
  ('physical', 'sinewy'),
  ('physical', 'sinking'),
  ('physical', 'sizzling'),
  ('physical', 'slack'),
  ('physical', 'slate'),
  ('physical', 'slaty'),
  ('physical', 'sleek'),
  ('physical', 'slender'),
  ('physical', 'sloped'),
  ('physical', 'slushy'),
  ('physical', 'smoky'),
  ('physical', 'smooth'),
  ('physical', 'snowy'),
  ('physical', 'snug'),
  ('physical', 'soapy'),
  ('physical', 'soaring'),
  ('physical', 'sodden'),
  ('physical', 'solid'),
  ('physical', 'sooty'),
  ('physical', 'spacious'),
  ('physical', 'sparkly'),
  ('physical', 'speckled'),
  ('physical', 'spiky'),
  ('physical', 'spinning'),
  ('physical', 'spongy'),
  ('physical', 'spotted'),
  ('physical', 'springy'),
  ('physical', 'squat'),
  ('physical', 'squishy'),
  ('physical', 'starchy'),
  ('physical', 'steely'),
  ('physical', 'steep'),
  ('physical', 'sticky'),
  ('physical', 'stippled'),
  ('physical', 'stocky'),
  ('physical', 'stony'),
  ('physical', 'straw'),
  ('physical', 'striped'),
  ('physical', 'sturdy'),
  ('physical', 'sudsy'),
  ('physical', 'sugary'),
  ('physical', 'sunlit'),
  ('physical', 'supple'),
  ('physical', 'swaying'),
  ('physical', 'swirled'),
  ('physical', 'syrupy'),
  ('physical', 'tarry'),
  ('physical', 'taupe'),
  ('physical', 'taut'),
  ('physical', 'tawny'),
  ('physical', 'tepid'),
  ('physical', 'ticking'),
  ('physical', 'tidy'),
  ('physical', 'tilted'),
  ('physical', 'tinny'),
  ('physical', 'tiny'),
  ('physical', 'toasty'),
  ('physical', 'tufted'),
  ('physical', 'tufty'),
  ('physical', 'tumbling'),
  ('physical', 'twiggy'),
  ('physical', 'twinkly'),
  ('physical', 'umber'),
  ('physical', 'vaulted'),
  ('physical', 'veined'),
  ('physical', 'velvet'),
  ('physical', 'velvety'),
  ('physical', 'verdant'),
  ('physical', 'violet'),
  ('physical', 'vivid'),
  ('physical', 'washed'),
  ('physical', 'wavy'),
  ('physical', 'waxen'),
  ('physical', 'waxy'),
  ('physical', 'whirring'),
  ('physical', 'whorled'),
  ('physical', 'winding'),
  ('physical', 'windy'),
  ('physical', 'wiry'),
  ('physical', 'wispy'),
  ('physical', 'wobbly'),
  ('physical', 'wooden'),
  ('physical', 'woollen'),
  ('physical', 'woolly'),
  ('physical', 'woven'),
  ('physical', 'wrinkled'),
  ('physical', 'yeasty'),
  ('personality', 'abiding'),
  ('personality', 'adept'),
  ('personality', 'adoring'),
  ('personality', 'affable'),
  ('personality', 'agile'),
  ('personality', 'alert'),
  ('personality', 'amiable'),
  ('personality', 'amused'),
  ('personality', 'ardent'),
  ('personality', 'artful'),
  ('personality', 'assured'),
  ('personality', 'astute'),
  ('personality', 'aware'),
  ('personality', 'balanced'),
  ('personality', 'bashful'),
  ('personality', 'beaming'),
  ('personality', 'benign'),
  ('personality', 'blithe'),
  ('personality', 'blunt'),
  ('personality', 'bold'),
  ('personality', 'bonny'),
  ('personality', 'bookish'),
  ('personality', 'bouncy'),
  ('personality', 'brave'),
  ('personality', 'buoyant'),
  ('personality', 'calm'),
  ('personality', 'candid'),
  ('personality', 'canny'),
  ('personality', 'careful'),
  ('personality', 'caring'),
  ('personality', 'casual'),
  ('personality', 'certain'),
  ('personality', 'chatty'),
  ('personality', 'cheerful'),
  ('personality', 'cheery'),
  ('personality', 'chipper'),
  ('personality', 'chirpy'),
  ('personality', 'chummy'),
  ('personality', 'civil'),
  ('personality', 'clear'),
  ('personality', 'clever'),
  ('personality', 'comic'),
  ('personality', 'content'),
  ('personality', 'cordial'),
  ('personality', 'courtly'),
  ('personality', 'coy'),
  ('personality', 'crafty'),
  ('personality', 'curious'),
  ('personality', 'dainty'),
  ('personality', 'dapper'),
  ('personality', 'daring'),
  ('personality', 'dashing'),
  ('personality', 'decent'),
  ('personality', 'deft'),
  ('personality', 'demure'),
  ('personality', 'devoted'),
  ('personality', 'diligent'),
  ('personality', 'direct'),
  ('personality', 'discreet'),
  ('personality', 'dogged'),
  ('personality', 'dreamy'),
  ('personality', 'driven'),
  ('personality', 'droll'),
  ('personality', 'dutiful'),
  ('personality', 'dynamic'),
  ('personality', 'eager'),
  ('personality', 'earnest'),
  ('personality', 'easeful'),
  ('personality', 'effusive'),
  ('personality', 'elated'),
  ('personality', 'elegant'),
  ('personality', 'eloquent'),
  ('personality', 'engaging'),
  ('personality', 'exact'),
  ('personality', 'fair'),
  ('personality', 'fearless'),
  ('personality', 'feisty'),
  ('personality', 'fervent'),
  ('personality', 'fervid'),
  ('personality', 'festive'),
  ('personality', 'fiery'),
  ('personality', 'firm'),
  ('personality', 'fleet'),
  ('personality', 'fluent'),
  ('personality', 'fond'),
  ('personality', 'frank'),
  ('personality', 'friendly'),
  ('personality', 'frugal'),
  ('personality', 'funny'),
  ('personality', 'gallant'),
  ('personality', 'generous'),
  ('personality', 'genial'),
  ('personality', 'gentle'),
  ('personality', 'giddy'),
  ('personality', 'giving'),
  ('personality', 'glad'),
  ('personality', 'gleeful'),
  ('personality', 'graceful'),
  ('personality', 'gracious'),
  ('personality', 'grateful'),
  ('personality', 'grounded'),
  ('personality', 'hardy'),
  ('personality', 'hearty'),
  ('personality', 'helpful'),
  ('personality', 'heroic'),
  ('personality', 'honest'),
  ('personality', 'hopeful'),
  ('personality', 'humble'),
  ('personality', 'humorous'),
  ('personality', 'hushed'),
  ('personality', 'idyllic'),
  ('personality', 'impish'),
  ('personality', 'jaunty'),
  ('personality', 'jolly'),
  ('personality', 'jovial'),
  ('personality', 'joyful'),
  ('personality', 'jubilant'),
  ('personality', 'jumpy'),
  ('personality', 'keen'),
  ('personality', 'keenly'),
  ('personality', 'kindly'),
  ('personality', 'kindred'),
  ('personality', 'kinetic'),
  ('personality', 'knowing'),
  ('personality', 'laconic'),
  ('personality', 'learned'),
  ('personality', 'lenient'),
  ('personality', 'limpid'),
  ('personality', 'lively'),
  ('personality', 'loving'),
  ('personality', 'loyal'),
  ('personality', 'lucid'),
  ('personality', 'lucky'),
  ('personality', 'magnetic'),
  ('personality', 'mannered'),
  ('personality', 'measured'),
  ('personality', 'meek'),
  ('personality', 'mellow'),
  ('personality', 'merry'),
  ('personality', 'mighty'),
  ('personality', 'mindful'),
  ('personality', 'mirthful'),
  ('personality', 'moderate'),
  ('personality', 'modest'),
  ('personality', 'nifty'),
  ('personality', 'noble'),
  ('personality', 'obliging'),
  ('personality', 'open'),
  ('personality', 'orderly'),
  ('personality', 'outgoing'),
  ('personality', 'patient'),
  ('personality', 'peaceful'),
  ('personality', 'peppery'),
  ('personality', 'peppy'),
  ('personality', 'perky'),
  ('personality', 'pithy'),
  ('personality', 'placid'),
  ('personality', 'plain'),
  ('personality', 'playful'),
  ('personality', 'pleasant'),
  ('personality', 'plucky'),
  ('personality', 'poetic'),
  ('personality', 'pointed'),
  ('personality', 'poised'),
  ('personality', 'polite'),
  ('personality', 'precise'),
  ('personality', 'prompt'),
  ('personality', 'prudent'),
  ('personality', 'punctual'),
  ('personality', 'quaint'),
  ('personality', 'quick'),
  ('personality', 'quiet'),
  ('personality', 'quirky'),
  ('personality', 'radiant'),
  ('personality', 'rational'),
  ('personality', 'ready'),
  ('personality', 'refined'),
  ('personality', 'regal'),
  ('personality', 'relaxed'),
  ('personality', 'reliable'),
  ('personality', 'resolute'),
  ('personality', 'restful'),
  ('personality', 'restless'),
  ('personality', 'reverent'),
  ('personality', 'robust'),
  ('personality', 'rosy'),
  ('personality', 'rousing'),
  ('personality', 'sage'),
  ('personality', 'sagely'),
  ('personality', 'savvy'),
  ('personality', 'scrappy'),
  ('personality', 'seasoned'),
  ('personality', 'secure'),
  ('personality', 'sedate'),
  ('personality', 'selfless'),
  ('personality', 'sensible'),
  ('personality', 'serene'),
  ('personality', 'serious'),
  ('personality', 'settled'),
  ('personality', 'sharing'),
  ('personality', 'sharp'),
  ('personality', 'shrewd'),
  ('personality', 'silly'),
  ('personality', 'simple'),
  ('personality', 'sincere'),
  ('personality', 'singing'),
  ('personality', 'sisterly'),
  ('personality', 'snappy'),
  ('personality', 'sober'),
  ('personality', 'sociable'),
  ('personality', 'solemn'),
  ('personality', 'soulful'),
  ('personality', 'speedy'),
  ('personality', 'spirited'),
  ('personality', 'sporting'),
  ('personality', 'spry'),
  ('personality', 'stable'),
  ('personality', 'stalwart'),
  ('personality', 'stately'),
  ('personality', 'staunch'),
  ('personality', 'steady'),
  ('personality', 'stirring'),
  ('personality', 'stoic'),
  ('personality', 'stoical'),
  ('personality', 'straight'),
  ('personality', 'striving'),
  ('personality', 'stubborn'),
  ('personality', 'studious'),
  ('personality', 'suave'),
  ('personality', 'subtle'),
  ('personality', 'sunny'),
  ('personality', 'sure'),
  ('personality', 'sweet'),
  ('personality', 'tactful'),
  ('personality', 'tender'),
  ('personality', 'thankful'),
  ('personality', 'thorough'),
  ('personality', 'thrifty'),
  ('personality', 'timely'),
  ('personality', 'tireless'),
  ('personality', 'tolerant'),
  ('personality', 'tranquil'),
  ('personality', 'true'),
  ('personality', 'trusting'),
  ('personality', 'trusty'),
  ('personality', 'truthful'),
  ('personality', 'unerring'),
  ('personality', 'unfussy'),
  ('personality', 'untiring'),
  ('personality', 'upbeat'),
  ('personality', 'upright'),
  ('personality', 'urbane'),
  ('personality', 'valiant'),
  ('personality', 'valorous'),
  ('personality', 'vibrant'),
  ('personality', 'vigilant'),
  ('personality', 'vocal'),
  ('personality', 'warmly'),
  ('personality', 'wary'),
  ('personality', 'watchful'),
  ('personality', 'willing'),
  ('personality', 'wily'),
  ('personality', 'winning'),
  ('personality', 'winsome'),
  ('personality', 'wise'),
  ('personality', 'wistful'),
  ('personality', 'witty'),
  ('personality', 'wondrous'),
  ('personality', 'worthy'),
  ('personality', 'youthful'),
  ('personality', 'zany'),
  ('personality', 'zealous'),
  ('personality', 'zestful'),
  ('personality', 'zesty'),
  ('personality', 'zippy'),
  ('animal', 'alpaca'),
  ('animal', 'anteater'),
  ('animal', 'antelope'),
  ('animal', 'avocet'),
  ('animal', 'baboon'),
  ('animal', 'badger'),
  ('animal', 'barbet'),
  ('animal', 'beaver'),
  ('animal', 'beetle'),
  ('animal', 'bison'),
  ('animal', 'bittern'),
  ('animal', 'bluejay'),
  ('animal', 'bobcat'),
  ('animal', 'bonobo'),
  ('animal', 'bream'),
  ('animal', 'buffalo'),
  ('animal', 'bullfrog'),
  ('animal', 'bullhead'),
  ('animal', 'bunting'),
  ('animal', 'caiman'),
  ('animal', 'camel'),
  ('animal', 'canary'),
  ('animal', 'capybara'),
  ('animal', 'cardinal'),
  ('animal', 'catbird'),
  ('animal', 'catfish'),
  ('animal', 'chamois'),
  ('animal', 'cheetah'),
  ('animal', 'chicken'),
  ('animal', 'chipmunk'),
  ('animal', 'chough'),
  ('animal', 'cicada'),
  ('animal', 'cisco'),
  ('animal', 'civet'),
  ('animal', 'coati'),
  ('animal', 'cobra'),
  ('animal', 'colobus'),
  ('animal', 'condor'),
  ('animal', 'corella'),
  ('animal', 'cougar'),
  ('animal', 'cowbird'),
  ('animal', 'coyote'),
  ('animal', 'crake'),
  ('animal', 'crappie'),
  ('animal', 'crayfish'),
  ('animal', 'cricket'),
  ('animal', 'cuckoo'),
  ('animal', 'curlew'),
  ('animal', 'dassie'),
  ('animal', 'dibbler'),
  ('animal', 'dingo'),
  ('animal', 'dipper'),
  ('animal', 'donkey'),
  ('animal', 'dormouse'),
  ('animal', 'dotterel'),
  ('animal', 'drongo'),
  ('animal', 'duckling'),
  ('animal', 'dugong'),
  ('animal', 'dunlin'),
  ('animal', 'dunnock'),
  ('animal', 'earwig'),
  ('animal', 'egret'),
  ('animal', 'eider'),
  ('animal', 'elk'),
  ('animal', 'emu'),
  ('animal', 'falcon'),
  ('animal', 'fantail'),
  ('animal', 'fennec'),
  ('animal', 'ferret'),
  ('animal', 'finch'),
  ('animal', 'firefly'),
  ('animal', 'flamingo'),
  ('animal', 'flounder'),
  ('animal', 'fossa'),
  ('animal', 'fulmar'),
  ('animal', 'galago'),
  ('animal', 'gannet'),
  ('animal', 'gavial'),
  ('animal', 'gazelle'),
  ('animal', 'gecko'),
  ('animal', 'genet'),
  ('animal', 'gerbil'),
  ('animal', 'gharial'),
  ('animal', 'gibbon'),
  ('animal', 'giraffe'),
  ('animal', 'godwit'),
  ('animal', 'goldfish'),
  ('animal', 'goose'),
  ('animal', 'gopher'),
  ('animal', 'gorilla'),
  ('animal', 'goshawk'),
  ('animal', 'grackle'),
  ('animal', 'grebe'),
  ('animal', 'grouse'),
  ('animal', 'grunion'),
  ('animal', 'guanaco'),
  ('animal', 'guppy'),
  ('animal', 'hamster'),
  ('animal', 'hedgehog'),
  ('animal', 'heron'),
  ('animal', 'herring'),
  ('animal', 'hippo'),
  ('animal', 'hoatzin'),
  ('animal', 'hoopoe'),
  ('animal', 'hornet'),
  ('animal', 'hyena'),
  ('animal', 'ibex'),
  ('animal', 'ibis'),
  ('animal', 'iguana'),
  ('animal', 'impala'),
  ('animal', 'indri'),
  ('animal', 'jacana'),
  ('animal', 'jackal'),
  ('animal', 'jackdaw'),
  ('animal', 'jaguar'),
  ('animal', 'junco'),
  ('animal', 'kakapo'),
  ('animal', 'katydid'),
  ('animal', 'kestrel'),
  ('animal', 'kinkajou'),
  ('animal', 'kite'),
  ('animal', 'kiwi'),
  ('animal', 'koala'),
  ('animal', 'kouprey'),
  ('animal', 'ladybug'),
  ('animal', 'lamprey'),
  ('animal', 'langur'),
  ('animal', 'lapwing'),
  ('animal', 'lemur'),
  ('animal', 'leopard'),
  ('animal', 'limpet'),
  ('animal', 'linnet'),
  ('animal', 'lizard'),
  ('animal', 'llama'),
  ('animal', 'lobster'),
  ('animal', 'locust'),
  ('animal', 'loon'),
  ('animal', 'lorikeet'),
  ('animal', 'lungfish'),
  ('animal', 'macaque'),
  ('animal', 'macaw'),
  ('animal', 'mackerel'),
  ('animal', 'magpie'),
  ('animal', 'mallard'),
  ('animal', 'manatee'),
  ('animal', 'mandrill'),
  ('animal', 'mantis'),
  ('animal', 'margay'),
  ('animal', 'markhor'),
  ('animal', 'marlin'),
  ('animal', 'marmot'),
  ('animal', 'marten'),
  ('animal', 'mayfly'),
  ('animal', 'meerkat'),
  ('animal', 'merlin'),
  ('animal', 'minnow'),
  ('animal', 'mole'),
  ('animal', 'mollusk'),
  ('animal', 'mongoose'),
  ('animal', 'monkey'),
  ('animal', 'moorhen'),
  ('animal', 'mudfish'),
  ('animal', 'muskox'),
  ('animal', 'muskrat'),
  ('animal', 'narwhal'),
  ('animal', 'newt'),
  ('animal', 'nilgai'),
  ('animal', 'noddy'),
  ('animal', 'numbat'),
  ('animal', 'nuthatch'),
  ('animal', 'nutria'),
  ('animal', 'nyala'),
  ('animal', 'oarfish'),
  ('animal', 'ocelot'),
  ('animal', 'octopus'),
  ('animal', 'okapi'),
  ('animal', 'onager'),
  ('animal', 'opossum'),
  ('animal', 'orca'),
  ('animal', 'oribi'),
  ('animal', 'oriole'),
  ('animal', 'ortolan'),
  ('animal', 'osprey'),
  ('animal', 'ostrich'),
  ('animal', 'otter'),
  ('animal', 'owl'),
  ('animal', 'oyster'),
  ('animal', 'panda'),
  ('animal', 'pangolin'),
  ('animal', 'panther'),
  ('animal', 'parakeet'),
  ('animal', 'parrot'),
  ('animal', 'peacock'),
  ('animal', 'peafowl'),
  ('animal', 'pelican'),
  ('animal', 'penguin'),
  ('animal', 'pigeon'),
  ('animal', 'pika'),
  ('animal', 'pipit'),
  ('animal', 'piranha'),
  ('animal', 'platypus'),
  ('animal', 'plover'),
  ('animal', 'pochard'),
  ('animal', 'pollock'),
  ('animal', 'porpoise'),
  ('animal', 'possum'),
  ('animal', 'potoo'),
  ('animal', 'prawn'),
  ('animal', 'puffin'),
  ('animal', 'puma'),
  ('animal', 'python'),
  ('animal', 'quagga'),
  ('animal', 'quail'),
  ('animal', 'quetzal'),
  ('animal', 'quokka'),
  ('animal', 'quoll'),
  ('animal', 'rabbit'),
  ('animal', 'raccoon'),
  ('animal', 'ratel'),
  ('animal', 'ratfish'),
  ('animal', 'raven'),
  ('animal', 'redshank'),
  ('animal', 'redstart'),
  ('animal', 'reindeer'),
  ('animal', 'rhino'),
  ('animal', 'robin'),
  ('animal', 'rook'),
  ('animal', 'rooster'),
  ('animal', 'rosella'),
  ('animal', 'saiga'),
  ('animal', 'saker'),
  ('animal', 'salmon'),
  ('animal', 'salmonid'),
  ('animal', 'sambar'),
  ('animal', 'sardine'),
  ('animal', 'sawfish'),
  ('animal', 'scallop'),
  ('animal', 'scaup'),
  ('animal', 'scorpion'),
  ('animal', 'seahorse'),
  ('animal', 'serin'),
  ('animal', 'serval'),
  ('animal', 'sheep'),
  ('animal', 'shelduck'),
  ('animal', 'shrew'),
  ('animal', 'shrimp'),
  ('animal', 'siamang'),
  ('animal', 'siskin'),
  ('animal', 'skipper'),
  ('animal', 'skua'),
  ('animal', 'skunk'),
  ('animal', 'skylark'),
  ('animal', 'sloth'),
  ('animal', 'smelt'),
  ('animal', 'snail'),
  ('animal', 'snapper'),
  ('animal', 'snipe'),
  ('animal', 'songbird'),
  ('animal', 'sora'),
  ('animal', 'sparrow'),
  ('animal', 'spider'),
  ('animal', 'squid'),
  ('animal', 'squirrel'),
  ('animal', 'starfish'),
  ('animal', 'starling'),
  ('animal', 'stingray'),
  ('animal', 'stork'),
  ('animal', 'sunbird'),
  ('animal', 'sunfish'),
  ('animal', 'surfbird'),
  ('animal', 'swallow'),
  ('animal', 'swift'),
  ('animal', 'swiftlet'),
  ('animal', 'takin'),
  ('animal', 'tamarin'),
  ('animal', 'tanager'),
  ('animal', 'tapir'),
  ('animal', 'tarpon'),
  ('animal', 'tayra'),
  ('animal', 'tench'),
  ('animal', 'termite'),
  ('animal', 'thrush'),
  ('animal', 'tiger'),
  ('animal', 'tilapia'),
  ('animal', 'titmouse'),
  ('animal', 'topi'),
  ('animal', 'tortoise'),
  ('animal', 'toucan'),
  ('animal', 'tragopan'),
  ('animal', 'treefrog'),
  ('animal', 'trout'),
  ('animal', 'tuatara'),
  ('animal', 'turaco'),
  ('animal', 'turkey'),
  ('animal', 'turtle'),
  ('animal', 'urchin'),
  ('animal', 'veery'),
  ('animal', 'verdin'),
  ('animal', 'vicuna'),
  ('animal', 'viper'),
  ('animal', 'vulture'),
  ('animal', 'wagtail'),
  ('animal', 'wallaby'),
  ('animal', 'walrus'),
  ('animal', 'wapiti'),
  ('animal', 'warbler'),
  ('animal', 'warthog'),
  ('animal', 'waxwing'),
  ('animal', 'weasel'),
  ('animal', 'whimbrel'),
  ('animal', 'whippet'),
  ('animal', 'widgeon'),
  ('animal', 'wigeon'),
  ('animal', 'wildcat'),
  ('animal', 'wombat'),
  ('animal', 'woodchat'),
  ('animal', 'woodlark'),
  ('animal', 'wrasse'),
  ('animal', 'xerus'),
  ('animal', 'yak'),
  ('animal', 'yapok'),
  ('animal', 'zebra'),
  ('animal', 'zorilla');

-- ---------------------------------------------------------------------------
-- Reading what someone typed
-- ---------------------------------------------------------------------------

-- Turns what a person typed into the stored form.
--
-- They will type `Brisk Stubborn Otter`, or `brisk_stubborn_otter`, or paste it
-- with a trailing space, and every one of those has to work. Normalising here
-- rather than in the web app means the future native client inherits it, and
-- means there is one definition of what a code is.
--
-- Returns null for anything that cannot be a code at all, which the caller
-- treats exactly like a wrong code: no hint about why.
create or replace function public.normalize_connect_code(p_raw text)
returns text
language sql
immutable
as $fn$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim(coalesce(p_raw, ''))), '[\s_]+', '-', 'g'),
          '[^a-z-]', '', 'g'
        ),
        '-+', '-', 'g'
      ),
      '-'
    ),
    ''
  );
$fn$;

revoke all on function public.normalize_connect_code(text) from public;

-- ---------------------------------------------------------------------------
-- Rate limiting redemption
-- ---------------------------------------------------------------------------

-- One row per wrong guess.
--
-- Why this table exists rather than a counter: a counter would have to be
-- incremented inside the transaction that then raises, and the raise rolls the
-- increment back. That is also why `open_exchange` now RETURNS a status for a
-- bad code instead of raising -- see the note on it below. The row has to
-- survive, so the transaction has to commit.
--
-- Nobody can read this table. It has row level security on and no policies and
-- no grants, so the only thing that touches it is a SECURITY DEFINER function.
create table public.connect_attempts (
  id      bigserial primary key,
  user_id uuid references public.profiles(user_id) on delete cascade,
  at      timestamptz not null default now()
);

create index connect_attempts_at_idx on public.connect_attempts (at desc);
create index connect_attempts_user_idx on public.connect_attempts (user_id, at desc);

alter table public.connect_attempts enable row level security;

comment on table public.connect_attempts is
  'One row per failed connect code redemption, for rate limiting. Readable by nobody; swept by purge_connect_attempts().';

-- The three numbers, as functions so they are documented in one place and a
-- test can read them rather than hard-coding them.
create or replace function public.connect_attempt_window()
returns interval language sql immutable as $fn$ select interval '1 minute' $fn$;

-- Generous enough for genuine typos -- three words typed on a phone in a hurry
-- will go wrong sometimes -- and far too small to guess with.
create or replace function public.connect_attempt_limit()
returns integer language sql immutable as $fn$ select 8 $fn$;

-- A ceiling across everyone, because one account is cheap to make and the
-- per-caller limit alone would just mean more accounts. High enough that real
-- traffic never reaches it at this size, and it is a number to raise as the app
-- grows rather than a permanent truth.
create or replace function public.connect_attempt_ceiling()
returns integer language sql immutable as $fn$ select 240 $fn$;

revoke all on function public.connect_attempt_window() from public;
revoke all on function public.connect_attempt_limit() from public;
revoke all on function public.connect_attempt_ceiling() from public;

-- ---------------------------------------------------------------------------
-- Minting
-- ---------------------------------------------------------------------------

-- Replaces the version in 0007. Same contract, same TTL rules, different
-- alphabet.
--
-- `order by gen_random_bytes(8)` rather than `order by random()`: random() is a
-- plain PRNG whose output is predictable from enough samples, and anyone can
-- collect samples by opening the connect screen repeatedly. pgcrypto's bytes are
-- not. It is evaluated per row, so this is a cryptographically random pick from
-- each list. `extensions` is on the search_path for the same reason as in 0007.
--
-- The retry loop is not paranoia: with a finite vocabulary two live codes can
-- collide, and the primary key will say so. A handful of attempts makes that a
-- non-event.
create or replace function public.mint_connect_token(p_ttl_seconds integer default 120)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_token text;
  v_exp   timestamptz;
  v_tries integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_ttl_seconds is null or p_ttl_seconds < 15 or p_ttl_seconds > 300 then
    raise exception 'ttl out of range';
  end if;

  -- Columns are qualified because this function's OUT parameters are named
  -- `token` and `expires_at`, which would otherwise shadow them.
  update public.connect_tokens
     set expires_at = now()
   where connect_tokens.user_id = v_uid
     and connect_tokens.consumed_at is null
     and connect_tokens.expires_at > now();

  v_exp := now() + make_interval(secs => p_ttl_seconds);

  loop
    v_tries := v_tries + 1;

    select string_agg(picked.word, '-' order by slot.ord) into v_token
      from (values ('physical', 1), ('personality', 2), ('animal', 3))
             as slot(kind, ord)
      cross join lateral (
        select cw.word
          from public.connect_words cw
         where cw.kind = slot.kind
         order by gen_random_bytes(8)
         limit 1
      ) as picked;

    begin
      insert into public.connect_tokens (token, user_id, expires_at)
      values (v_token, v_uid, v_exp);

      return query select v_token, v_exp;
      return;
    exception when unique_violation then
      if v_tries >= 6 then
        raise;
      end if;
    end;
  end loop;
end;
$fn$;

revoke all on function public.mint_connect_token(integer) from public;
grant execute on function public.mint_connect_token(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Redeeming
-- ---------------------------------------------------------------------------

-- Replaces the version in 0002. Two changes, both consequences of the shorter
-- code.
--
-- 1. It normalises what it is given, so typing counts as scanning.
--
-- 2. **A bad code now RETURNS ('invalid', null) instead of raising.** That is a
--    contract change and it is deliberate: the rate limiting above has to
--    record the failed guess, and a row written in a transaction that then
--    raises is a row that never existed. Returning lets the transaction commit.
--    A caller that hits the limit gets ('rate_limited', null).
--
--    The two cases a client cannot reach by accident still raise: no session at
--    all, and redeeming your own code. Neither is an attack worth counting, and
--    the second is a bug in the client.
--
-- Everything else is unchanged from 0002: the token is consumed only if the
-- exchange actually opens, 'already_connected' leaves it unspent, and opening
-- shares nothing because both people still confirm.
create or replace function public.open_exchange(
  p_token  text,
  p_method public.exchange_method
)
returns table (status text, exchange_id uuid)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_code   text;
  v_owner  uuid;
  v_id     uuid;
  v_mine   integer;
  v_anyone integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select count(*) into v_mine
    from public.connect_attempts a
   where a.user_id = v_uid
     and a.at > now() - public.connect_attempt_window();

  if v_mine >= public.connect_attempt_limit() then
    -- Deliberately not recorded: a limiter that feeds itself never lets go.
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  select count(*) into v_anyone
    from public.connect_attempts a
   where a.at > now() - public.connect_attempt_window();

  if v_anyone >= public.connect_attempt_ceiling() then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  v_code := public.normalize_connect_code(p_token);

  if v_code is null then
    insert into public.connect_attempts (user_id) values (v_uid);
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  select t.user_id into v_owner
    from public.connect_tokens t
   where t.token = v_code
     and t.consumed_at is null
     and t.expires_at > now()
   for update;

  if v_owner is null then
    insert into public.connect_attempts (user_id) values (v_uid);
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  if v_owner = v_uid then
    raise exception 'cannot exchange with yourself';
  end if;

  if exists (
    select 1 from public.connections c
    where c.owner_id = v_uid and c.other_id = v_owner
  ) then
    return query select 'already_connected'::text, null::uuid;
    return;
  end if;

  update public.connect_tokens t
     set consumed_at = now(), consumed_by = v_uid
   where t.token = v_code;

  insert into public.exchanges (method, initiator_id, responder_id, expires_at)
  values (p_method, v_uid, v_owner, now() + interval '30 seconds')
  returning id into v_id;

  return query select 'opened'::text, v_id;
end;
$fn$;

revoke all on function public.open_exchange(text, public.exchange_method) from public;
grant execute on function public.open_exchange(text, public.exchange_method) to authenticated;

-- Anyone may read the vocabulary. It is a word list, not a secret: knowing the
-- words is assumed in the entropy arithmetic above.
grant select on public.connect_words to authenticated;

-- ---------------------------------------------------------------------------
-- Hygiene
-- ---------------------------------------------------------------------------

create or replace function public.purge_connect_attempts()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with gone as (
    delete from public.connect_attempts
     where at < now() - interval '1 hour'
    returning 1
  )
  select count(*) into v_count from gone;

  return coalesce(v_count, 0);
end;
$fn$;

revoke all on function public.purge_connect_attempts() from public;

select cron.schedule(
  'guy-purge-connect-attempts',
  '*/5 * * * *',
  $cron$ select public.purge_connect_attempts(); $cron$
);
