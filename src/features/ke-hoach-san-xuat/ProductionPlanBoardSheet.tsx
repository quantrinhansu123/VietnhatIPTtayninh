import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from '../../components/layout/constants';
import { formatDateDdMmYyyy } from '../../utils/dateFormat';
import {
  type ProductionPlanBoard,
  type ProductionPlanBoardCellItem,
  type ProductionPlanBoardRow
} from './productionPlanBoard';

function renderCellItems(items: ProductionPlanBoardCellItem[] | undefined, keyPrefix: string) {
  if (!items || items.length === 0) return null;
  return items.map(item => (
    <div key={`${keyPrefix}-${item.id}`} className="production-plan-board-cell-line">
      {item.parts.map((part, index) => (
        <span
          key={`${item.id}-${index}`}
          className={part.tone === 'weight' ? 'production-plan-board-cell-weight' : undefined}
        >
          {part.text}
        </span>
      ))}
    </div>
  ));
}

function BoardTable({ board }: { board: ProductionPlanBoard }) {
  return (
    <table className="production-plan-board-table">
      <colgroup>
        <col className="production-plan-board-col-label" />
        {board.columns.map(column => (
          <col key={column.key} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className="production-plan-board-th production-plan-board-th-label">Lao động</th>
          {board.columns.map(column => (
            <th key={column.key} className="production-plan-board-th">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {board.blocks.map(block => {
          const roman = block.kind === 'labor' ? 'I' : 'II';
          return (
            <React.Fragment key={block.key}>
              {block.rows.map((row, rowIndex) => {
                const first = rowIndex === 0;
                return (
                  <tr key={row.kind === 'blank' ? `${row.key}-${rowIndex}` : row.key} className={row.kind === 'blank' ? 'production-plan-board-row-blank' : undefined}>
                    {first ? (
                      <td rowSpan={block.rows.length} className="production-plan-board-roman">
                        {roman}
                      </td>
                    ) : null}
                    <BoardRowCells row={row} columns={board.columns} />
                  </tr>
                );
              })}
            </React.Fragment>
          );
        })}
        {board.lineCount === 0 ? (
          <tr>
            <td colSpan={board.columns.length + 1} className="production-plan-board-empty">
              Chưa có lệnh sản xuất.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function shiftTitleLabel(shiftLabel: string) {
  const match = /^C(\d+)$/.exec(shiftLabel);
  return match ? `CA ${match[1]}:` : `${shiftLabel}:`;
}

function BoardRowCells({
  row,
  columns
}: {
  row: ProductionPlanBoardRow;
  columns: ProductionPlanBoard['columns'];
}) {
  switch (row.kind) {
    case 'labor':
      return (
        <>
          <th className="production-plan-board-th-label production-plan-board-cell" scope="row" />
          {columns.map(column => {
            const values = row.cells[column.key];
            return (
              <td key={column.key} className="production-plan-board-cell production-plan-board-cell-staff">
                {values && values.length > 0
                  ? values.map((value, index) => <div key={index}>{value}</div>)
                  : null}
              </td>
            );
          })}
        </>
      );
    case 'shiftTitle':
      return (
        <>
          <th
            className="production-plan-board-th-label production-plan-board-cell production-plan-board-shift-title"
            scope="row"
          >
            {shiftTitleLabel(row.shiftLabel)}
          </th>
          {columns.map(column => (
            <td key={column.key} className="production-plan-board-cell production-plan-board-shift-title" />
          ))}
        </>
      );
    case 'orders':
      return (
        <>
          <th className="production-plan-board-th-label production-plan-board-cell" scope="row" />
          {columns.map(column => (
            <td key={column.key} className="production-plan-board-cell">
              {renderCellItems(row.cells[column.key], `${row.key}-${column.key}`)}
            </td>
          ))}
        </>
      );
    case 'blank':
      return (
        <>
          <td className="production-plan-board-cell" />
          {columns.map(column => (
            <td key={column.key} className="production-plan-board-cell" />
          ))}
        </>
      );
    default:
      return null;
  }
}

export function ProductionPlanBoardScreen({
  board,
  planDate = ''
}: {
  board: ProductionPlanBoard;
  planDate?: string;
}) {
  return (
    <div className="production-plan-board-screen">
      <BoardTable board={board} />
    </div>
  );
}

export function ProductionPlanBoardPrintSheet({
  board,
  planDate = ''
}: {
  board: ProductionPlanBoard;
  planDate?: string;
}) {
  const printDate = formatDateDdMmYyyy(planDate) || formatDateDdMmYyyy(new Date());

  return (
    <div className="production-plan-board-print-sheet">
      <div className="production-plan-board-print-doc">
        <header className="production-plan-board-print-header">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-plan-board-print-logo" />
          <div className="production-plan-board-print-title">
            <p className="production-plan-board-print-company">{PRINT_COMPANY_NAME}</p>
            <h1>KẾ HOẠCH SẢN XUẤT NGÀY : {printDate}</h1>
          </div>
        </header>
        <BoardTable board={board} />
      </div>
    </div>
  );
}
