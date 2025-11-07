'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ChartDataPoint {
  date: string;
  compliance: number;
  passed: number;
  failed: number;
}

interface ComplianceTrendChartProps {
  data: ChartDataPoint[];
}

export default function ComplianceTrendChart({ data }: ComplianceTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
          interval="preserveStartEnd"
        />
        <YAxis 
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
          domain={[0, 100]}
          label={{ value: 'Compliance %', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
          formatter={(value: any, name: string) => {
            // Handle null, undefined, array, or number values
            if (value === null || value === undefined) {
              return ['N/A', name || 'Compliance'];
            }
            
            // Handle array values (recharts sometimes passes arrays)
            let numValue: number;
            if (Array.isArray(value)) {
              numValue = typeof value[0] === 'number' ? value[0] : parseFloat(String(value[0])) || 0;
            } else if (typeof value === 'number') {
              numValue = value;
            } else {
              numValue = parseFloat(String(value)) || 0;
            }
            
            return [`${numValue.toFixed(1)}%`, name || 'Compliance'];
          }}
        />
        <Area
          type="monotone"
          dataKey="compliance"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

