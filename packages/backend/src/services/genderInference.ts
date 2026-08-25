/**
 * Gender Inference Service
 * 
 * Provides automated gender discovery and classification via:
 * 1. Social profile pronoun extraction (e.g. He/Him -> male, She/Her -> female, They/Them -> other)
 * 2. High-precision first-name statistical lookup heuristics covering international names (English, Indian, European, Hispanic, Asian, etc.)
 */

// Pronoun regex patterns
const MALE_PRONOUNS_RE = /\b(he\s*\/\s*him|he\s*\/\s*his|he\s*\/\s*him\s*\/\s*his|he\/they)\b/i;
const FEMALE_PRONOUNS_RE = /\b(she\s*\/\s*her|she\s*\/\s*hers|she\s*\/\s*her\s*\/\s*hers|she\/they)\b/i;
const NEUTRAL_PRONOUNS_RE = /\b(they\s*\/\s*them|they\s*\/\s*theirs|ze\s*\/\s*zir|xe\s*\/\s*xir)\b/i;

// High-confidence dictionary for common international names
const COMMON_MALE_NAMES = new Set([
  // English / Western
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
  'christopher', 'daniel', 'matthew', 'anthony', 'donald', 'mark', 'paul', 'steven', 'andrew', 'kenneth',
  'joshua', 'george', 'kevin', 'brian', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan',
  'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon',
  'benjamin', 'samuel', 'gregory', 'alexander', 'frank', 'patrick', 'raymond', 'jack', 'dennis', 'jerry',
  'tyler', 'aaron', 'jose', 'adam', 'nathan', 'henry', 'douglas', 'zachary', 'peter', 'kyle', 'walter',
  'ethan', 'jeremy', 'harold', 'keith', 'christian', 'roger', 'noah', 'gerald', 'carl', 'terry', 'sean',
  'arthur', 'austin', 'jesse', 'joe', 'bryan', 'billy', 'jordan', 'albert', 'dylan', 'bruce', 'willie',
  'gabriel', 'logan', 'alan', 'juan', 'wayne', 'elijah', 'randy', 'roy', 'vincent', 'ralph', 'eugene',
  'russell', 'bobby', 'mason', 'philip', 'louis', 'lucas', 'liam', 'oliver', 'lucas', 'leo', 'max',
  // Indian / South Asian
  'aarav', 'aditya', 'ajay', 'akash', 'amit', 'anand', 'anil', 'ankit', 'anmol', 'arjun', 'arun', 'ashish',
  'ashok', 'avinash', 'ayush', 'balram', 'bhavesh', 'bharat', 'chetan', 'chirag', 'deepak', 'dev', 'dhanush',
  'dhruv', 'dilip', 'dinesh', 'ganesh', 'gaurav', 'gautam', 'girish', 'gopal', 'hardik', 'harish', 'harsh',
  'hemant', 'hitesh', 'ishan', 'jagdish', 'jay', 'jitendra', 'kamal', 'karan', 'kartik', 'kunal', 'lakshya',
  'lokesh', 'madhav', 'manish', 'manoj', 'mayank', 'mohit', 'mukesh', 'nakul', 'naresh', 'naveen', 'neeraj',
  'nikhil', 'nitin', 'om', 'pankaj', 'parth', 'pawan', 'piyush', 'pradeep', 'prakash', 'pranay', 'prasad',
  'prashant', 'prateek', 'pravin', 'rahul', 'raj', 'rajat', 'rajesh', 'rajiv', 'rakesh', 'ram', 'raman',
  'ramesh', 'ravi', 'rishabh', 'rishikesh', 'rohit', 'ronit', 'sachin', 'sameer', 'samir', 'sanjay', 'sanjeev',
  'santosh', 'sarvesh', 'satish', 'saurabh', 'shankar', 'shantanu', 'shivam', 'shubham', 'siddharth', 'sourabh',
  'subhash', 'sudarshan', 'sumit', 'sundar', 'sunil', 'suresh', 'surya', 'tarun', 'tejas', 'uday', 'utkarsh',
  'vaibhav', 'varun', 'vedant', 'vikas', 'vikram', 'vinay', 'vineet', 'vipul', 'virender', 'vishal', 'vivek',
  'yash', 'yuvraj',
  // European / Spanish / French / German
  'alessandro', 'alvaro', 'andreas', 'antoine', 'antonio', 'carlos', 'diego', 'etienne', 'felix', 'francesco',
  'francois', 'giovanni', 'guillaume', 'hans', 'javier', 'jean', 'jorge', 'julien', 'klaus', 'laurent',
  'luca', 'luis', 'manuel', 'marco', 'mario', 'mateo', 'matteo', 'miguel', 'nicolas', 'pablo', 'pierre',
  'rafael', 'sebastian', 'sergio', 'stefan', 'tiago', 'victor',
]);

const COMMON_FEMALE_NAMES = new Set([
  // English / Western
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle',
  'carol', 'amanda', 'dorothy', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia',
  'kathleen', 'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'emma', 'nicole', 'helen', 'samantha',
  'katherine', 'christine', 'debra', 'rachel', 'carolyn', 'janet', 'maria', 'catherine', 'heather', 'diane',
  'olivia', 'julie', 'joyce', 'victoria', 'ruth', 'virginia', 'lauren', 'kelly', 'christina', 'joan', 'evelyn',
  'judith', 'andrea', 'hannah', 'megan', 'cheryl', 'jacqueline', 'martha', 'madison', 'teresa', 'gloria',
  'sara', 'janice', 'ann', 'kathryn', 'abigail', 'sophia', 'frances', 'jean', 'alice', 'judy', 'isabella',
  'julia', 'grace', 'amber', 'denise', 'danielle', 'marilyn', 'beverly', 'charlotte', 'natalie', 'theresa',
  'diana', 'brittany', 'doris', 'kayla', 'chloe', 'mia', 'ella', 'ava', 'amelia', 'harper', 'sophie',
  'jane', 'claire', 'lucy', 'zoe', 'chloe', 'lily', 'grace', 'zoey', 'ellie', 'nora', 'hazel',
  // Indian / South Asian
  'aakanksha', 'aanya', 'aaradhya', 'aarti', 'aditi', 'aishwarya', 'akanksha', 'amita', 'amrita', 'ananya',
  'anchal', 'anjali', 'ankita', 'anoushka', 'anu', 'anupama', 'anuradha', 'anushka', 'aparna', 'archana',
  'arpita', 'arti', 'ashwini', 'avantika', 'bhavna', 'chhavi', 'deepa', 'deepika', 'deepti', 'devika',
  'dhriti', 'divya', 'garima', 'gayatri', 'geeta', 'harshita', 'isha', 'ishita', 'janvi', 'jaya', 'jyoti',
  'kajal', 'kalpana', 'kamini', 'kavita', 'khushi', 'kirti', 'komal', 'kriti', 'lakshmi', 'lavanya', 'leela',
  'madhuri', 'mahima', 'malini', 'manisha', 'mansi', 'meena', 'meenakshi', 'meera', 'mona', 'monika', 'mridula',
  'mukta', 'namrata', 'nandini', 'neeta', 'neha', 'nidhi', 'nikita', 'nishtha', 'nupur', 'pallavi', 'parul',
  'payal', 'pooja', 'poonam', 'prachi', 'pratibha', 'prerna', 'priya', 'priyanka', 'radha', 'radhika', 'ragini',
  'rakhi', 'rashmi', 'richa', 'ritu', 'roshni', 'ruchi', 'rupa', 'sakshi', 'saloni', 'sandhya', 'sangeeta',
  'sanika', 'sarika', 'sarita', 'seema', 'shalini', 'shashi', 'sheela', 'shikha', 'shilpa', 'shivani',
  'shreya', 'shruti', 'shweta', 'simran', 'smita', 'sneha', 'sonal', 'sonali', 'sonia', 'soumya', 'srishti',
  'suman', 'sunita', 'surbhi', 'swati', 'tanvi', 'tanya', 'tara', 'tejaswini', 'trisha', 'upasana', 'urvashi',
  'vaishali', 'vandana', 'varnika', 'vedika', 'vidya', 'vinita', 'vrinda', 'yamini',
  // European / Spanish / French / German
  'ana', 'camille', 'carmen', 'clara', 'elena', 'eva', 'francesca', 'giulia', 'helene', 'ines', 'isabelle',
  'laura', 'lucia', 'manon', 'marta', 'martina', 'nathalie', 'paola', 'paula', 'sofia', 'valerie',
]);

/**
 * Extracts gender from pronoun expressions in text (e.g. LinkedIn bio, headline, pronouns badge)
 */
export function inferGenderFromPronouns(text?: string | null): 'male' | 'female' | 'other' | null {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();

  if (MALE_PRONOUNS_RE.test(clean)) return 'male';
  if (FEMALE_PRONOUNS_RE.test(clean)) return 'female';
  if (NEUTRAL_PRONOUNS_RE.test(clean)) return 'other';

  return null;
}

/**
 * Classifies gender from first name using a high-precision statistical lookup
 */
export function inferGenderFromName(firstName?: string | null): 'male' | 'female' | null {
  if (!firstName || typeof firstName !== 'string') return null;

  // Extract clean first word
  const normalized = firstName.trim().toLowerCase().split(/[\s-]+/)[0]?.replace(/[^a-z]/g, '') || '';
  if (!normalized || normalized.length < 2) return null;

  if (COMMON_MALE_NAMES.has(normalized)) return 'male';
  if (COMMON_FEMALE_NAMES.has(normalized)) return 'female';

  return null;
}

/**
 * Main inference pipeline:
 * 1. Checks explicit pronouns if provided
 * 2. Checks first-name dictionary heuristic
 */
export function inferProspectGender(data: {
  firstName?: string | null;
  pronounsOrBio?: string | null;
}): string | null {
  if (data.pronounsOrBio) {
    const fromPronouns = inferGenderFromPronouns(data.pronounsOrBio);
    if (fromPronouns) return fromPronouns;
  }

  if (data.firstName) {
    const fromName = inferGenderFromName(data.firstName);
    if (fromName) return fromName;
  }

  return null;
}
