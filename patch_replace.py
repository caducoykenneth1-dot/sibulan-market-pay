from pathlib import Path
path = Path('dumaguete_market_pay/src/data/dashboardStats.ts')
lines = path.read_text().splitlines()
start = next(i for i,line in enumerate(lines) if 'const collectorMap' in line)
end = next(i for i,line in enumerate(lines) if line.strip().startswith('return {'))
new_block_lines = [
  const collectorKey = (value: string | null | undefined) =>
    (value?.trim().toLowerCase() || 'unknown');

  const collectorMap = new Map<
    string,
