import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Upload, Search, Bell, RefreshCw, SlidersHorizontal,
  AlignLeft, Info, ArrowUpRight, LayoutDashboard,
  ChartNoAxesCombined, ShieldCheck, ClipboardList,
  Settings, Palette, Headphones, ChevronDown, FileSpreadsheet,
  LoaderCircle, X, CircleAlert
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid, BarChart, Bar
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

export const Box = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [fileName, setFileName] = useState("Sample dataset");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("details");
  const [activeNav, setActiveNav] = useState("Exploratory Data Analysis");
  const [heatmapMode, setHeatmapMode] = useState("Correlation");
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

  const missingChart = missingByColumn.map(item => ({
    name: item.name,
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

  const maxMissing = Math.max(1, ...missingChart.map(item => item.missing));
  const visibleColumns = filteredColumns;

  return (
    <main className="eda-app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <span>Stechgrow</span>
          <LayoutDashboard size={19} className="brand-menu" />
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
              placeholder="Search for columns..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            {search && <button onClick={() => setSearch("")}><X size={15} /></button>}
          </label>

          <div className="topbar-spacer" />
          <button className="gradient-button" title="Refresh dataset" onClick={resetData}>
            <RefreshCw size={20} />
          </button>
          <button className="icon-button" title="Notifications" onClick={() => setShowInfo(!showInfo)}>
            <Bell size={19} />
          </button>
          <div className="avatar">B<span /></div>
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
            <button className="data-analysis-button" onClick={() => setActiveNav("Data Analysis")}>
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
            <span>Heatmap display:</span>
            <button onClick={() => setHeatmapMode("Correlation")}>Correlation</button>
            <button onClick={() => setHeatmapMode("Absolute")}>Absolute values</button>
            <button onClick={() => setShowSettings(false)}><X size={15} /></button>
          </div>
        )}

        <section className="summary-grid">
          <article className="summary-card">
            <div className="card-heading">Data Summary <ArrowUpRight size={17} /></div>
            <div className="big-number">{formatNumber(rows.length)}</div>
            <div className="summary-bottom">
              <div><span>Total Rows</span><strong>{formatNumber(rows.length)}</strong></div>
              <div><span>Total Columns</span><strong>{columns.length}</strong></div>
            </div>
            <div className="mini-bars"><i /><i /></div>
          </article>

          <article className="summary-card">
            <div className="card-heading">Numeric Columns <ArrowUpRight size={17} /></div>
            <div className="big-number">{numericColumns.length}</div>
            <div className="summary-bottom">
              <div><span>Mean of means</span><strong>
                {statistics.length
                  ? formatNumber(statistics.reduce((s, item) => s + item.mean, 0) / statistics.length)
                  : "—"}
              </strong></div>
              <div><span>Average correlation</span><strong>{averageCorrelation.toFixed(2)}</strong></div>
            </div>
            <div className="mini-bars"><i /><i /><i /></div>
          </article>

          <article className="summary-card">
            <div className="card-heading">Categorical Columns <ArrowUpRight size={17} /></div>
            <div className="big-number">{categoricalColumns.length}</div>
            <p className="muted">Detected text and category fields</p>
            <div className="category-pills">
              {categoricalColumns.slice(0, 4).map((column, index) => (
                <span key={column} className={`pill pill-${index}`}>{column}</span>
              ))}
              {!categoricalColumns.length && <span className="muted">No categorical columns</span>}
            </div>
          </article>

          <article className="summary-card">
            <div className="card-heading">Datetime Columns <ArrowUpRight size={17} /></div>
            <div className="big-number">{datetimeColumns.length}</div>
            <p className="muted">Detected date and time fields</p>
            <div className="datetime-bars"><i /><i /><i /><i /></div>
          </article>
        </section>

        <section className="analysis-grid">
          <div className="left-analysis">
            <article className="panel missing-panel">
              <div className="panel-title">
                <h2>Missing values</h2>
                <span>Missing cells <strong>{totalMissing}</strong></span>
              </div>
              <div className="missing-content">
                <div className="missing-stat">
                  <p>Empty cells found across the uploaded dataset</p>
                  <div className="big-number">{formatNumber(totalMissing)}</div>
                  <span className="success-badge">
                    {rows.length && columns.length
                      ? (totalMissing / (rows.length * columns.length) * 100).toFixed(2)
                      : "0.00"}%
                  </span>
                  <small>of all dataset cells</small>
                </div>
                <div className="missing-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={missingChart}>
                      <defs>
                        <linearGradient id="missingGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6554ff" stopOpacity={0.8} />
                          <stop offset="100%" stopColor="#6554ff" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#41414b" strokeDasharray="3 5" vertical />
                      <XAxis dataKey="name" tick={{ fill: "#999", fontSize: 10 }} />
                      <YAxis hide />
                      <Tooltip contentStyle={{ background: "#222", border: "1px solid #444", color: "#fff" }} />
                      <Area dataKey="missing" type="monotone" stroke="#7060ff" strokeWidth={3} fill="url(#missingGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="missing-legend">
                {missingByColumn.slice(0, 4).map(item => (
                  <span key={item.name}>{item.name}: {item.missing} ({item.percent.toFixed(1)}%)</span>
                ))}
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
            <div className="panel-title">
              <h2>Correlation Heatmap</h2>
              <label className="select-control">
                <select value={heatmapMode} onChange={event => setHeatmapMode(event.target.value)}>
                  <option>Correlation</option>
                  <option>Absolute</option>
                </select>
                <ChevronDown size={14} />
              </label>
            </div>
            {heatmap.length > 0 ? (
              <div className="heatmap-layout">
                <div className="heatmap-y-labels">
                  {heatmap.map(row => <span key={row.name} title={row.name}>{row.name}</span>)}
                </div>
                <div className="heatmap" style={{ gridTemplateColumns: `repeat(${numericColumns.length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${numericColumns.length}, minmax(0, 1fr))` }}>
                  {heatmap.map(row => row.cells.map(cell => {
                    const value = heatmapMode === "Absolute" ? Math.abs(cell.value) : cell.value;
                    const hue = value < 0 ? 328 : 245;
                    const lightness = 50 + (1 - Math.abs(value)) * 32;
                    return (
                      <div
                        key={`${row.name}-${cell.column}`}
                        className="heat-cell"
                        title={`${row.name} × ${cell.column}: ${cell.value.toFixed(3)}`}
                        style={{ backgroundColor: `hsl(${hue}, 90%, ${lightness}%)` }}
                      />
                    );
                  }))}
                </div>
                <div className="heatmap-scale"><span>1.0</span><i /><span>0</span><i /><span>-1.0</span></div>
                <div className="heatmap-x-labels">
                  {numericColumns.map(column => <span key={column} title={column}>{column}</span>)}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <ChartNoAxesCombined size={34} />
                <h3>No numeric columns</h3>
                <p>Upload a CSV containing numeric data to calculate correlations.</p>
              </div>
            )}
            <div className="heatmap-footer">
              <span>{numericColumns.length} numeric columns</span>
              <span>Mean absolute correlation: {averageCorrelation.toFixed(3)}</span>
            </div>
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

