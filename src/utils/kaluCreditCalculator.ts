import { getVIPLevelInfo } from '../config/vipMatrix';

export type KaluCreditOption = '1_inicial' | '2_iniciales' | '3_cuotas' | '6_cuotas' | 'fiado_total';

export function calculateKaluCreditBreakdown(
  option: KaluCreditOption,
  total: number,
  points: number
): {
  initialPct: number;
  initialAmount: number;
  financedAmount: number;
  installmentsCount: number;
  installments: { installmentNumber: number; amount: number; daysOffset: number }[];
} {
  const parseSafeDec = (v: number) => Math.round(v * 100) / 100;

  if (option === 'fiado_total') {
    return {
      initialPct: 0,
      initialAmount: 0,
      financedAmount: parseSafeDec(total),
      installmentsCount: 0,
      installments: []
    };
  }

  const vip = getVIPLevelInfo(points);
  const initialPct = vip.initialPct;
  const initialAmount = parseSafeDec(total * initialPct);
  const financedAmount = parseSafeDec(total - initialAmount);

  let count = 1;
  if (option === '1_inicial') count = 1;
  else if (option === '2_iniciales') count = 2;
  else if (option === '3_cuotas') count = 3;
  else if (option === '6_cuotas') count = 6;

  const baseCuota = Math.floor((financedAmount / count) * 100) / 100;
  const installments: { installmentNumber: number; amount: number; daysOffset: number }[] = [];
  let sumPrevious = 0;

  for (let i = 1; i <= count; i++) {
    const isLast = i === count;
    const amount = isLast ? parseSafeDec(financedAmount - sumPrevious) : baseCuota;
    sumPrevious = parseSafeDec(sumPrevious + amount);
    installments.push({
      installmentNumber: i,
      amount,
      daysOffset: i * 15
    });
  }

  return {
    initialPct,
    initialAmount,
    financedAmount,
    installmentsCount: count,
    installments
  };
}
