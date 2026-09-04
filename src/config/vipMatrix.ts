export interface VIPLevelConfig {
  level: number;
  code: string;
  name: string;
  shortName: string;
  minPoints: number;
  maxPoints: number;
  initialPct: number; // e.g., 0.75 = 75%
  mainCreditLimit: number; // e.g., 100
  mainMaxInstallments: number; // e.g., 3
  dailyCreditLimit: number; // e.g., 50
  dailyInstallments: number; // e.g., 1
  dailyTermDays: number; // e.g., 15
  badgeColor: string;
  nextPrize: string;
  description: string;
}

export const VIP_LEVELS_MATRIX: VIPLevelConfig[] = [
  {
    level: 1,
    code: 'K1',
    name: 'Clase Estándar',
    shortName: 'Estándar',
    minPoints: 0,
    maxPoints: 120,
    initialPct: 0.75,
    mainCreditLimit: 100,
    mainMaxInstallments: 3,
    dailyCreditLimit: 50,
    dailyInstallments: 1,
    dailyTermDays: 15,
    badgeColor: 'from-zinc-700 to-zinc-900 border-zinc-600 text-zinc-300',
    nextPrize: 'Ascenso a Clase Select (Línea $180 y $80 en comida)',
    description: 'Nivel inicial con acceso a financiamiento con 75% de inicial y hasta 3 cuotas.'
  },
  {
    level: 2,
    code: 'K2',
    name: 'Clase Select',
    shortName: 'Select',
    minPoints: 120,
    maxPoints: 250,
    initialPct: 0.75,
    mainCreditLimit: 180,
    mainMaxInstallments: 3,
    dailyCreditLimit: 80,
    dailyInstallments: 1,
    dailyTermDays: 15,
    badgeColor: 'from-amber-900/60 to-zinc-900 border-amber-700/50 text-amber-300',
    nextPrize: 'Ascenso a Clase Premier (Inicial baja al 55% y Línea $250)',
    description: 'Mayor cupo disponible para tus compras cotidianas y víveres con $180 en línea principal.'
  },
  {
    level: 3,
    code: 'K3',
    name: 'Clase Premier',
    shortName: 'Premier',
    minPoints: 250,
    maxPoints: 450,
    initialPct: 0.55,
    mainCreditLimit: 250,
    mainMaxInstallments: 3,
    dailyCreditLimit: 100,
    dailyInstallments: 1,
    dailyTermDays: 15,
    badgeColor: 'from-blue-900/60 to-zinc-900 border-blue-600/50 text-blue-300',
    nextPrize: 'Ascenso a Clase Élite (Inicial baja al 45% y Línea $350)',
    description: 'La inicial requerida baja al 55%, tu línea sube a $250.00 y cotidiana a $100.00.'
  },
  {
    level: 4,
    code: 'K4',
    name: 'Clase Élite',
    shortName: 'Élite',
    minPoints: 450,
    maxPoints: 750,
    initialPct: 0.45,
    mainCreditLimit: 350,
    mainMaxInstallments: 3,
    dailyCreditLimit: 130,
    dailyInstallments: 1,
    dailyTermDays: 15,
    badgeColor: 'from-purple-900/60 to-zinc-900 border-purple-600/50 text-purple-300',
    nextPrize: 'Ascenso a Clase Black (Hasta 5 cuotas, Inicial 35% y Línea $450)',
    description: 'Inicial preferencial del 45% con cupo principal de $350.00 y cotidiana de $130.00.'
  },
  {
    level: 5,
    code: 'K5',
    name: 'Clase Black',
    shortName: 'Black',
    minPoints: 750,
    maxPoints: 1200,
    initialPct: 0.35,
    mainCreditLimit: 450,
    mainMaxInstallments: 5,
    dailyCreditLimit: 160,
    dailyInstallments: 1,
    dailyTermDays: 15,
    badgeColor: 'from-zinc-900 via-neutral-900 to-black border-amber-500/60 text-amber-400',
    nextPrize: 'Ascenso a Clase Black Diamond (Inicial 20%, 6 cuotas y Línea $500)',
    description: 'Inicial reducida al 35%, hasta 5 cuotas quincenales y línea ampliada a $450.00.'
  },
  {
    level: 6,
    code: 'K6',
    name: 'Clase Black Diamond',
    shortName: 'Black Diamond',
    minPoints: 1200,
    maxPoints: Infinity,
    initialPct: 0.20,
    mainCreditLimit: 500,
    mainMaxInstallments: 6,
    dailyCreditLimit: 200,
    dailyInstallments: 1,
    dailyTermDays: 15,
    badgeColor: 'from-emerald-950 via-zinc-900 to-black border-emerald-400/80 text-emerald-300',
    nextPrize: 'Nivel Máximo VIP alcanzado',
    description: 'Nivel Supremo: Solo 20% de inicial, hasta 6 cuotas quincenales y cupo máximo de $500.00.'
  }
];

export function getVIPLevelInfo(points: number = 0): VIPLevelConfig & { progress: number; nextGoal: number } {
  const p = Math.max(0, Number(points || 0));
  
  let current = VIP_LEVELS_MATRIX[0];
  if (p >= 1200) current = VIP_LEVELS_MATRIX[5];
  else if (p >= 750) current = VIP_LEVELS_MATRIX[4];
  else if (p >= 450) current = VIP_LEVELS_MATRIX[3];
  else if (p >= 250) current = VIP_LEVELS_MATRIX[2];
  else if (p >= 120) current = VIP_LEVELS_MATRIX[1];
  else current = VIP_LEVELS_MATRIX[0];

  let progress = 100;
  let nextGoal = current.maxPoints;

  if (current.level < 6) {
    const range = current.maxPoints - current.minPoints;
    const currentInRange = p - current.minPoints;
    progress = Math.min(100, Math.max(0, (currentInRange / range) * 100));
    nextGoal = current.maxPoints;
  } else {
    progress = 100;
    nextGoal = 1200;
  }

  return {
    ...current,
    progress,
    nextGoal
  };
}
