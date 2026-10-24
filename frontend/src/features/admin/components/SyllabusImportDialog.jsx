import { useEffect, useRef, useState } from 'react';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Checkbox from '../../../components/ui/Checkbox';
import Dialog from '../../../components/ui/Dialog';
import { useToast } from '../../../components/ui/ToastProvider';
import { adminApi } from '../../../services/adminApi';
import { formatBytes, formatNumber } from '../../../utils/format';
import '../admin.css';

/**
 * Bulk syllabus import (PRD 4.6) — `POST /api/v1/admin/syllabus/import`.
 *
 * The CSV columns are `subject, unit, chapter, topic, estimated_minutes,
 * difficulty, importance, description`. The file is parsed locally first so the
 * operator can see exactly what will be sent; the authoritative validation is
 * the server's, and its per-row `errors[]` are listed verbatim afterwards.
 */

const COLUMNS = [
  'subject',
  'unit',
  'chapter',
  'topic',
  'estimated_minutes',
  'difficulty',
  'importance',
  'description',
];
const REQUIRED = ['subject', 'unit', 'topic'];
const MAX_PREVIEW_ROWS = 25;

/** Minimal RFC4180 line splitter: handles quoted fields and escaped quotes. */
function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      out.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  out.push(field);
  return out.map((value) => value.trim());
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { header: [], rows: [], problem: 'The file has no content.' };
  }
  const header = splitCsvLine(lines[0]).map((value) => value.toLowerCase());
  const missing = REQUIRED.filter((column) => !header.includes(column));
  if (missing.length) {
    return {
      header,
      rows: [],
      problem: `Missing required column(s): ${missing.join(', ')}. Expected header: ${COLUMNS.join(', ')}.`,
    };
  }
  const rows = lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    const row = {};
    header.forEach((column, position) => {
      row[column] = values[position] ?? '';
    });
    const problems = REQUIRED.filter((column) => !row[column]);
    const minutes = row.estimated_minutes;
    if (minutes && !/^\d+$/.test(minutes)) problems.push('estimated_minutes');
    if (row.difficulty && !['easy', 'medium', 'hard'].includes(row.difficulty.toLowerCase())) {
      problems.push('difficulty');
    }
    if (row.importance && !['low', 'medium', 'high'].includes(row.importance.toLowerCase())) {
      problems.push('importance');
    }
    return { line: index + 2, row, problems };
  });
  return { header, rows, problem: null };
}

export default function SyllabusImportDialog({
  open,
  version,
  onClose,
  onImported,
}) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [createSubjects, setCreateSubjects] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [failure, setFailure] = useState(null);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setParsed(null);
    setReport(null);
    setFailure(null);
    setCreateSubjects(true);
    if (fileRef.current) fileRef.current.value = '';
  }, [open]);

  async function onFileChange(event) {
    const candidate = event.target.files?.[0] || null;
    setFile(candidate);
    setParsed(null);
    setReport(null);
    setFailure(null);
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith('.csv')) {
      setFailure('Only .csv files can be imported.');
      return;
    }
    try {
      const text = await candidate.text();
      setParsed(parseCsv(text));
    } catch {
      setFailure('The file could not be read.');
    }
  }

  async function submit() {
    if (!file || !version) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await adminApi.syllabus.importCsv(file, version.id, {
        create_subjects: createSubjects ? 'true' : 'false',
      });
      setReport(result.report);
      toast.success('Import finished', result.message);
      onImported?.();
    } catch (caught) {
      setFailure(caught.fields?.file || caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    try {
      await adminApi.syllabus.importTemplate();
    } catch (caught) {
      toast.apiError(caught, 'Could not download the template');
    }
  }

  const badRows = parsed?.rows.filter((row) => row.problems.length) || [];
  const canSubmit =
    Boolean(file) && Boolean(parsed) && !parsed.problem && parsed.rows.length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Bulk import syllabus from CSV"
      description={
        version
          ? `Rows are added to draft version ${version.version_number}. Students keep reading the published version until this draft is published.`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {report ? 'Close' : 'Cancel'}
          </Button>
          <Button variant="secondary" iconLeft="download" onClick={downloadTemplate}>
            Template
          </Button>
          <Button
            variant="primary"
            iconLeft="upload"
            loading={busy}
            disabled={!canSubmit}
            onClick={submit}
          >
            Import {parsed?.rows.length ? `${parsed.rows.length} row(s)` : ''}
          </Button>
        </>
      }
    >
      <div className="sp-stack">
        <div className="sp-adm__filepick">
          <label htmlFor="sp-syl-csv">
            <strong>CSV file</strong>
          </label>
          <input
            id="sp-syl-csv"
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            aria-describedby="sp-syl-csv-hint"
          />
          <p className="sp-adm__itemmeta" id="sp-syl-csv-hint">
            Columns: {COLUMNS.join(', ')}. <strong>subject</strong>,{' '}
            <strong>unit</strong> and <strong>topic</strong> are required;{' '}
            <strong>chapter</strong> is optional and nests topics one level deeper.
            {file ? ` Selected: ${file.name} (${formatBytes(file.size)}).` : ''}
          </p>
          {failure ? (
            <p className="sp-adm__error" role="alert">
              {failure}
            </p>
          ) : null}
        </div>

        <Checkbox
          label="Create subjects that do not exist yet"
          description="They are created as active subjects and linked to this course."
          checked={createSubjects}
          onChange={(event) => setCreateSubjects(event.target.checked)}
        />

        {parsed?.problem ? (
          <p className="sp-adm__error" role="alert">
            {parsed.problem}
          </p>
        ) : null}

        {parsed && !parsed.problem ? (
          <div className="sp-stack">
            <div className="sp-adm__chips">
              <Badge tone="info">{formatNumber(parsed.rows.length)} rows read</Badge>
              <Badge tone={badRows.length ? 'warning' : 'success'}>
                {formatNumber(parsed.rows.length - badRows.length)} look valid
              </Badge>
              {badRows.length ? (
                <Badge tone="danger">
                  {formatNumber(badRows.length)} will likely be rejected
                </Badge>
              ) : null}
            </div>

            <div className="sp-adm__preview">
              <table>
                <caption className="sp-visually-hidden">
                  Preview of the first {MAX_PREVIEW_ROWS} CSV rows
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    {COLUMNS.map((column) => (
                      <th scope="col" key={column}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, MAX_PREVIEW_ROWS).map((entry) => (
                    <tr
                      key={entry.line}
                      className={entry.problems.length ? 'is-bad' : undefined}
                    >
                      <td>{entry.line}</td>
                      {COLUMNS.map((column) => (
                        <td key={column}>{entry.row[column] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > MAX_PREVIEW_ROWS ? (
              <p className="sp-adm__itemmeta">
                Showing the first {MAX_PREVIEW_ROWS} of{' '}
                {formatNumber(parsed.rows.length)} rows. All rows are sent.
              </p>
            ) : null}

            {badRows.length ? (
              <div>
                <span className="sp-adm__dt">Local checks that failed</span>
                <ul className="sp-adm__list">
                  {badRows.slice(0, 10).map((entry) => (
                    <li key={`bad-${entry.line}`}>
                      <span className="sp-adm__primary">
                        <span className="sp-adm__itemtitle">Row {entry.line}</span>
                        <span className="sp-adm__itemmeta">
                          Problem with: {entry.problems.join(', ')}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {report ? (
          <div className="sp-stack">
            <span className="sp-adm__dt">Server import report</span>
            <dl className="sp-adm__dl">
              <div>
                <span className="sp-adm__dt">Rows read</span>
                <dd className="sp-adm__dd">{formatNumber(report.rows_read)}</dd>
              </div>
              <div>
                <span className="sp-adm__dt">Accepted</span>
                <dd className="sp-adm__dd">{formatNumber(report.rows_valid)}</dd>
              </div>
              <div>
                <span className="sp-adm__dt">Rejected</span>
                <dd className="sp-adm__dd">{formatNumber(report.rows_rejected)}</dd>
              </div>
              <div>
                <span className="sp-adm__dt">Created</span>
                <dd className="sp-adm__dd">
                  {formatNumber(report.created?.subjects)} subjects ·{' '}
                  {formatNumber(report.created?.units)} units ·{' '}
                  {formatNumber(report.created?.chapters)} chapters ·{' '}
                  {formatNumber(report.created?.topics)} topics
                </dd>
              </div>
            </dl>

            {report.errors?.length ? (
              <div className="sp-adm__preview">
                <table>
                  <caption className="sp-visually-hidden">
                    Rows the server rejected
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">Column</th>
                      <th scope="col">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.errors.map((entry, index) => (
                      <tr key={`err-${entry.row}-${index}`} className="is-bad">
                        <td>{entry.row}</td>
                        <td>{entry.column || '—'}</td>
                        <td style={{ whiteSpace: 'normal' }}>{entry.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="sp-adm__note">Every row was accepted.</p>
            )}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
