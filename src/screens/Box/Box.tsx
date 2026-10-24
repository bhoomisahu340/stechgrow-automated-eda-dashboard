import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Upload, Search, Bell, RefreshCw, SlidersHorizontal,
  AlignLeft, Info, ArrowUpRight, LayoutDashboard,
  ChartNoAxesCombined, ShieldCheck, ClipboardList,
  Settings, Palette, Headphones, ChevronDown, FileSpreadsheet,
  LoaderCircle, X, CircleAlert, PanelLeft
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid,ReferenceLine
} from "recharts";
import "./Box.css";

type Row = Record<string, string>;
type Tab = "details" | "anomalies";

const initialRows: Row[] = [
  { Revenue: "1200", Orders: "35", Customers: "22", Rating: "4.2", Region: "Mumbai" },
  { Revenue: "1800", Orders: "48", Customers: "31", Rating: "4.5", Region: "Pune" },
  { Revenue: "900", Orders: "20", Customers: "15", Rating: "3.8", Region: "Mumbai" },
  { Revenue: "2500", Orders: "67", Customers: "43", Rating: "4.8", Region: "Delhi" },
  { Revenue: "1500", Orders: "39", Customers: "27", Rating: "4.1", Region: "Pune" },
  { Revenue: "5000", Orders: "90", Customers: "58", Rating: "4.9", Region: "Delhi" },
];

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Exploratory Data Analysis", icon: ChartNoAxesCombined },
  { label: "Data Analysis", icon: ChartNoAxesCombined },
  { label: "Risk Detection & Health", icon: ShieldCheck },
  { label: "Advisory Recommendation", icon: ShieldCheck },
  { label: "Report", icon: ClipboardList },
  { label: "Employee Dashboard", icon: LayoutDashboard },
];

function isMissing(value: unknown) {
  return value == null || String(value).trim() === "";
}

function numericValues(rows: Row[], column: string): number[] {
  return rows
    .map(row => row[column])
    .filter(value => !isMissing(value))
    .map(value => Number(value))
    .filter(value => Number.isFinite(value));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2
  }).format(value);
}

function AppIcon({ icon: Icon }: { icon: typeof Upload }) {
  return <Icon size={17} strokeWidth={1.8} />;
}

// Map correlation values [-1, 1] to exact Figma palette colors
function getFigmaHeatmapColor(value: number) {
  const norm = Math.max(-1, Math.min(1, value));

  if (norm > 0.75)  return "#FF5100"; // Bright Orange
  if (norm > 0.5)   return "#FF854C"; // Orange-Peach
  if (norm > 0.25)  return "#FFC5AA"; // Soft Peach
  if (norm > 0)     return "#C4C4FF"; // Light Lavender Blue
  if (norm > -0.25) return "#9B9BFF"; // Periwinkle Blue
  if (norm > -0.5)  return "#8787FF"; // Medium Blue-Purple
  if (norm > -0.75) return "#6767C5"; // Darker Blue-Purple
  return "#F275BB";                 // Pink (for extreme negative correlation)
}

export const Box = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [fileName, setFileName] = useState("Sample dataset");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("details");
  const [activeNav, setActiveNav] = useState("Exploratory Data Analysis");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const columns = useMemo(
    () => rows.length ? Object.keys(rows[0]) : [],
    [rows]
  );

  const numericColumns = useMemo(() => columns.filter(column => {
    const values = numericValues(rows, column);
    return values.length > 0 && values.length >= rows.length * 0.5;
  }), [columns, rows]);

  const datetimeColumns = useMemo(() => columns.filter(column => {
    if (numericColumns.includes(column)) return false;
    return /date|time|timestamp|created_at/i.test(column);
  }), [columns, numericColumns]);

  const categoricalColumns = columns.filter(
    column => !numericColumns.includes(column) && !datetimeColumns.includes(column)
  );

  const missingByColumn = useMemo(() => columns.map(column => ({
    name: column,
    missing: rows.filter(row => isMissing(row[column])).length,
    percent: rows.length
      ? rows.filter(row => isMissing(row[column])).length / rows.length * 100
      : 0
  })), [columns, rows]);

  const totalMissing = missingByColumn.reduce((sum, item) => sum + item.missing, 0);

  const statistics = useMemo(() => numericColumns.map(column => {
    const values = numericValues(rows, column);
    const mean = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = median(sorted.slice(0, Math.floor(sorted.length / 2)));
    const q3 = median(sorted.slice(Math.ceil(sorted.length / 2)));
    const low = q1 - 1.5 * (q3 - q1);
    const high = q3 + 1.5 * (q3 - q1);
    const outliers = values.filter(value => value < low || value > high);

    return {
      column,
      mean,
      median: median(values),
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
      outliers
    };
  }), [numericColumns, rows]);

  const anomalyRows = statistics.flatMap(stat =>
    stat.outliers.map(value => ({
      column: stat.column,
      value,
      mean: stat.mean,
      median: stat.median
    }))
  );

  const filteredColumns = columns.filter(column =>
    column.toLowerCase().includes(search.toLowerCase())
  );

  const heatmap = useMemo(() => {
    return numericColumns.map(a => ({
      name: a,
      cells: numericColumns.map(b => {
        const pairs = rows
          .map(row => [Number(row[a]), Number(row[b])] as const)
          .filter(pair => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
        if (pairs.length < 2) return { column: b, value: 0 };

        const meanA = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
        const meanB = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
        const numerator = pairs.reduce((s, p) =>
          s + (p[0] - meanA) * (p[1] - meanB), 0);
        const denominator = Math.sqrt(
          pairs.reduce((s, p) => s + (p[0] - meanA) ** 2, 0) *
          pairs.reduce((s, p) => s + (p[1] - meanB) ** 2, 0)
        );
        return { column: b, value: denominator ? numerator / denominator : 0 };
      })
    }));
  }, [numericColumns, rows]);

  const averageCorrelation = useMemo(() => {
    const values = heatmap.flatMap(row =>
      row.cells.filter(cell => cell.column !== row.name).map(cell => Math.abs(cell.value))
    );
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }, [heatmap]);

  // Spread the missing-value observations across a numeric 200–1000 axis.
  // This keeps the requested evenly spaced scale while retaining each column's missing count.
  const missingChart = missingByColumn.map((item, index) => ({
    name: missingByColumn.length <= 1
      ? 600
      : 200 + (index / (missingByColumn.length - 1)) * 800,
    missing: item.missing
  }));

  const handleUpload = (file?: File) => {
    if (!file) return;
    setError("");

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please select a CSV file.");
      return;
    }

    setLoading(true);
    setFileName(file.name);

    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: header => header.trim(),
      complete: result => {
        const parsed = result.data.filter(row =>
          Object.values(row).some(value => !isMissing(value))
        );

        if (!parsed.length || !Object.keys(parsed[0] ?? {}).length) {
          setError("This CSV has no usable data. Please check the file and try again.");
        } else {
          setRows(parsed);
          setTab("details");
          setSearch("");
        }

        if (result.errors.length) {
          console.warn("CSV parsing warnings:", result.errors);
        }

        setLoading(false);
      },
      error: () => {
        setError("The CSV could not be read. Please try another file.");
        setLoading(false);
      }
    });
  };

  const resetData = () => {
    setRows(initialRows);
    setFileName("Sample dataset");
    setError("");
    setSearch("");
  };

  const visibleColumns = filteredColumns;

  return (
    <main className={`eda-app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <span>Stechgrow</span>
          <button className="brand-menu" type="button" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setSidebarCollapsed(value => !value)}><PanelLeft size={19} /></button>
        </div>

        <button className="quick-search" onClick={() => {
          document.getElementById("dataset-search")?.focus();
        }}>
          <Search size={17} /> AI Quick Search
        </button>

        <nav className="main-nav">
          {navItems.map(item => (
            <button
              key={item.label}
              className={`nav-item ${activeNav === item.label ? "nav-active" : ""}`}
              onClick={() => setActiveNav(item.label)}
            >
              <AppIcon icon={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {[
            { label: "Preferences", icon: SlidersHorizontal },
            { label: "Theme", icon: Palette },
            { label: "Help & Support", icon: Headphones },
            { label: "Settings", icon: Settings }
          ].map(item => (
            <button key={item.label} className="nav-item" onClick={() => setShowSettings(!showSettings)}>
              <AppIcon icon={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <button className="upload-button" onClick={() => inputRef.current?.click()}>
            <Upload size={18} /> Upload
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={event => {
              handleUpload(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />

          <label className="search-box">
            <Search size={19} />
            <input
              id="dataset-search"
              placeholder="Search for anything"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            {search && <button onClick={() => setSearch("")}><X size={15} /></button>}
          </label>

          <div className="topbar-spacer" />
          
          <div className="topbar-icon-group flex items-center gap-1.5 bg-[#1c1e24] p-1 rounded-xl border border-white/5">
            <button className="icon-button refresh-button" title="Refresh dataset" onClick={resetData}>
              <RefreshCw size={18} />
            </button>
            <button className="icon-button" title="Notifications" onClick={() => setShowInfo(!showInfo)}>
              <Bell size={18} />
            </button>
          </div>

          <div className="avatar-wrapper relative">
            <img 
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80" 
              alt="Profile" 
              className="w-9 h-9 rounded-full object-cover border border-white/20"
            />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#0d0e12]"></span>
          </div>
        </header>

        <div className="page-heading">
          <div>
            <h1>Automated Exploratory Data Analysis</h1>
            <p className="dataset-name">
              <FileSpreadsheet size={14} /> {fileName}
            </p>
          </div>
          <div className="heading-actions">
            <button className="icon-button" title="Display settings" onClick={() => setShowSettings(!showSettings)}>
              <SlidersHorizontal size={18} />
            </button>
            <button className="icon-button" title="List view" onClick={() => setTab("details")}>
              <AlignLeft size={18} />
            </button>
            <button className="icon-button" title="Reset sample data" onClick={resetData}>
              <RefreshCw size={18} />
            </button>
            <button className="icon-button" title="Information" onClick={() => setShowInfo(!showInfo)}>
              <Info size={18} />
            </button>
            <button className="data-analysis-button bg-white text-black font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 transition shadow-sm" onClick={() => setActiveNav("Data Analysis")}>
              <LayoutDashboard size={18} /> Data Analysis
            </button>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <CircleAlert size={18} />
            <span>{error}</span>
            <button onClick={() => setError("")}><X size={16} /></button>
          </div>
        )}

        {loading && (
          <div className="loading-banner">
            <LoaderCircle size={19} className="spin" /> Processing your CSV file...
          </div>
        )}

        {showInfo && (
          <div className="notice-banner">
            This dashboard calculates statistics from the dataset currently loaded in your browser.
            <button onClick={() => setShowInfo(false)}><X size={15} /></button>
          </div>
        )}

        {showSettings && (
          <div className="notice-banner">
            <span>Heatmap display options</span>
            <button onClick={() => setShowSettings(false)}><X size={15} /></button>
          </div>
        )}

        <section className="summary-grid">
          <article className="summary-card">
            <div className="card-heading">Data Summary <ArrowUpRight size={17} /></div>
            <div className="big-number">{formatNumber(rows.length)}</div>
            <div className="summary-bottom summary-rows">
              <div><span>Total Rows</span><strong>{formatNumber(rows.length)}</strong><i className="row-line row-line-pink" /></div>
              <div><span>Total Columns</span><strong>{columns.length}</strong><i className="row-line row-line-purple" /></div>
            </div>
          </article>

          <article className="summary-card relative">
            <div className="card-heading flex justify-between items-center">
              <span>Numeric Columns</span> 
              <span className="correlation-badge">{averageCorrelation.toFixed(2)}</span>
            </div>
            <div className="big-number">{numericColumns.length}</div>
            <div className="summary-bottom summary-rows numeric-summary-rows">
              <div><span>Mean</span><strong>{statistics.length
                  ? formatNumber(statistics.reduce((s, item) => s + item.mean, 0) / statistics.length)
                  : "—"}</strong><i className="row-line row-line-pink" /></div>
              <div><span>Median</span><strong>{statistics.length
                  ? formatNumber(statistics.reduce((s, item) => s + item.median, 0) / statistics.length)
                  : "—"}</strong><i className="row-line row-line-purple" /></div>
              <div><span>Average correlation</span><strong>{averageCorrelation.toFixed(2)}</strong><i className="row-line row-line-green" /></div>
            </div>
          </article>

          <article className="summary-card flex justify-between items-center">
            <div>
              <div className="card-heading">Categorical Columns <ArrowUpRight size={17} /></div>
              <div className="big-number">{categoricalColumns.length}</div>
              <p className="muted">Detected text and category fields</p>
              <div className="category-pills">
                {categoricalColumns.slice(0, 4).map((column, index) => (
                  <span key={column} className={`pill pill-${index}`}>{column}</span>
                ))}
                {!categoricalColumns.length && <span className="muted">No categorical columns</span>}
              </div>
            </div>
            <div className="flex items-end gap-1 h-12">
              <div className="w-1.5 h-10 bg-pink-500 rounded-full"></div>
              <div className="w-1.5 h-12 bg-purple-500 rounded-full"></div>
              <div className="w-1.5 h-8 bg-emerald-400 rounded-full"></div>
            </div>
          </article>

          <article className="summary-card flex justify-between items-center">
            <div>
              <div className="card-heading">Datetime Columns <ArrowUpRight size={17} /></div>
              <div className="big-number">{datetimeColumns.length}</div>
              <p className="muted">Detected date and time fields</p>
            </div>
            <div className="flex items-end gap-1 h-12">
              <div className="w-1.5 h-11 bg-emerald-400 rounded-full"></div>
              <div className="w-1.5 h-8 bg-teal-500 rounded-full"></div>
              <div className="w-1.5 h-12 bg-emerald-300 rounded-full"></div>
            </div>
          </article>
        </section>

        <section className="analysis-grid">
          <div className="left-analysis">
            <article className="panel missing-panel">
              <div className="panel-title flex justify-between items-center">
                <h2>Missing values</h2>
                <span className="correlation-indicator">Average correlation <strong>{averageCorrelation.toFixed(2)}</strong></span>
              </div>
              
              <div className="missing-content flex flex-col md:flex-row gap-4 items-center">
                <div className="missing-stat min-w-[120px]">
                  <p className="text-xs text-gray-400">Empty cells found</p>
                  <div className="big-number text-2xl font-bold">{formatNumber(totalMissing)}</div>
                  <span className="success-badge bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-md font-semibold">
                    {rows.length && columns.length
                      ? (totalMissing / (rows.length * columns.length) * 100).toFixed(2)
                      : "0.00"}%
                  </span>
                  <small className="block text-[10px] text-gray-400 mt-1">of all dataset cells</small>
                </div>

                <div className="missing-chart">
 <ResponsiveContainer width="100%" height="100%">
  <AreaChart data={missingChart}>
    <defs>
      <linearGradient id="missingGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.8} />
        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.0} />
      </linearGradient>
    </defs>
    
    <CartesianGrid
      stroke="#3b3b43"
      strokeDasharray="3 4"
      vertical={false}
      horizontal={false}
    />
    
    {/* Clean dynamic vertical lines for your exact ticks without separate imports */}
    {[200, 400, 600, 800, 1000].map((tickVal) => (
      <ReferenceLine key={tickVal} x={tickVal} stroke="#3b3b43" strokeDasharray="3 4" strokeOpacity={0.6} />
    ))}

    <XAxis
      type="number"
      dataKey="name"
      domain={[200, 1000]}
      ticks={[200, 400, 600, 800, 1000]}
      interval={0}
      padding={{ left: 15, right: 15 }}
      allowDecimals={false}
      tickFormatter={(value: number) => String(value)}
      tick={{ fill: "#d0d0d5", fontSize: 10 }}
      axisLine={false}
      tickLine={false}
    />
    <YAxis hide domain={[0, (dataMax: number) => Math.max(1, dataMax * 1.15)]} />
    <Tooltip contentStyle={{ background: "#1f222a", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }} />
    <Area dataKey="missing" type="monotone" stroke="#a78bfa" strokeWidth={3} fill="url(#missingGradient)" />
  </AreaChart>
</ResponsiveContainer>
                </div>
              </div>
            </article>

            <article className="panel details-panel">
              <div className="tab-header">
                <button className={tab === "anomalies" ? "selected-tab" : ""} onClick={() => setTab("anomalies")}>
                  Top Anomalies
                </button>
                <button className={tab === "details" ? "selected-tab" : ""} onClick={() => setTab("details")}>
                  Dataset Details
                </button>
              </div>
              <div className="table-scroll">
                {tab === "details" ? (
                  <table>
                    <thead>
                      <tr><th>Column</th><th>Data type</th><th>Sample</th><th>Missing</th><th>Mean</th><th>Median</th></tr>
                    </thead>
                    <tbody>
                      {visibleColumns.map(column => {
                        const stat = statistics.find(item => item.column === column);
                        const sample = rows.find(row => !isMissing(row[column]))?.[column] ?? "—";
                        const missing = missingByColumn.find(item => item.name === column);
                        return (
                          <tr key={column}>
                            <td>{column}</td>
                            <td>{stat ? "numeric" : datetimeColumns.includes(column) ? "datetime" : "categorical"}</td>
                            <td>{String(sample).slice(0, 25)}</td>
                            <td>{missing?.missing ?? 0} ({(missing?.percent ?? 0).toFixed(1)}%)</td>
                            <td>{stat ? formatNumber(stat.mean) : "—"}</td>
                            <td>{stat ? formatNumber(stat.median) : "—"}</td>
                          </tr>
                        );
                      })}
                      {!visibleColumns.length && <tr><td colSpan={6}>No matching columns found.</td></tr>}
                    </tbody>
                  </table>
                ) : (
                  <table>
                    <thead><tr><th>Column</th><th>Outlier value</th><th>Mean</th><th>Median</th><th>Detection</th></tr></thead>
                    <tbody>
                      {anomalyRows.filter(item => item.column.toLowerCase().includes(search.toLowerCase())).map((item, index) => (
                        <tr key={`${item.column}-${index}`}>
                          <td>{item.column}</td><td>{formatNumber(item.value)}</td>
                          <td>{formatNumber(item.mean)}</td><td>{formatNumber(item.median)}</td>
                          <td><span className="warning-badge">Potential IQR outlier</span></td>
                        </tr>
                      ))}
                      {!anomalyRows.length && <tr><td colSpan={5}>No potential outliers detected.</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </article>
          </div>

          <article className="panel heatmap-panel">
            <div className="panel-title flex justify-between items-center mb-3">
              <h2>Co-relation Heatmap</h2>
              <button className="flex items-center gap-1.5 bg-[#22252e] text-xs px-3 py-1.5 rounded-lg border border-white/5 text-gray-300">
                <span>Map Style</span>
                <ChevronDown size={14} />
              </button>
            </div>

            {heatmap.length > 0 ? (
              <div className="figma-heatmap-wrapper flex flex-col gap-2">
                
                {/* Main Grid Block + Right Scale Bar */}
                <div className="flex gap-3 items-stretch">
                  
                  {/* Left Y-Axis Row Labels (A, B, C...) */}
                  <div className="flex flex-col justify-around text-xs font-medium text-gray-400 pr-1 py-2">
                    {heatmap.map((row, index) => (
                      <span key={row.name} title={row.name}>
                        {String.fromCharCode(65 + index % 26)}
                      </span>
                    ))}
                  </div>

                  {/* Single Seamless Heatmap Block (No Cell Borders) */}
                  <div 
                    className="figma-heatmap-block"
                    style={{ 
                      gridTemplateColumns: `repeat(${numericColumns.length}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${numericColumns.length}, minmax(0, 1fr))` 
                    }}
                  >
                    {heatmap.map(row => row.cells.map(cell => (
                      <div
                        key={`${row.name}-${cell.column}`}
                        className="figma-heat-cell"
                        title={`${row.name} × ${cell.column}: ${cell.value.toFixed(3)}`}
                        style={{ backgroundColor: getFigmaHeatmapColor(cell.value) }}
                      />
                    )))}
                  </div>

                  {/* Vertical Single-Gradient Scale Legend */}
                  <div className="flex flex-col justify-between items-center py-1 text-[10px] text-gray-400 font-medium">
                    <span>1.00</span>
                    <div className="heatmap-gradient"></div>
                    <span>-1.00</span>
                  </div>

                </div>

                {/* Bottom X-Axis Column Labels (A, B, C...) */}
                <div className="flex pl-6 pr-6 justify-around text-xs font-medium text-gray-400">
                  {numericColumns.map((column, index) => (
                    <span key={column} title={column}>
                      {String.fromCharCode(65 + index % 26)}
                    </span>
                  ))}
                </div>

              </div>
            ) : (
              <div className="empty-state">
                <ChartNoAxesCombined size={34} />
                <h3>No numeric columns</h3>
                <p>Upload a CSV containing numeric data to calculate correlations.</p>
              </div>
            )}
          </article>
        </section>

        <footer className="page-footer">
          <span>Automated EDA · Browser-based analysis</span>
          <span>{rows.length.toLocaleString()} rows · {columns.length} columns</span>
        </footer>
      </section>
    </main>
  );
};