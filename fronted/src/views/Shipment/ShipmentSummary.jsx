export function ShipmentSummary({ shipments }) {
  const totalQty = shipments.reduce((sum, s) => {
    return sum + (s.cells || []).reduce((cellSum, cell) => cellSum + (Number(cell.qty) || 0), 0);
  }, 0);

  const uniqueItems = new Set(shipments.map(s => s.item)).size;
  const uniqueSections = new Set(shipments.map(s => s.section)).size;

  return (
    <div className="shipment-summary">
      <h3>Выбранные позиции</h3>
      
      <div className="summary-stats">
        <div className="stat">
          <span className="stat-label">Позиций:</span>
          <span className="stat-value">{shipments.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Уникальных изделий:</span>
          <span className="stat-value">{uniqueItems}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Секций:</span>
          <span className="stat-value">{uniqueSections}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Общее кол-во:</span>
          <span className="stat-value">{totalQty}</span>
        </div>
      </div>

      <div className="selected-items">
        {shipments.map(shipment => (
          <div key={shipment.id} className="selected-item">
            <span className="item-section">{shipment.section}</span>
            <span className="item-name">{shipment.item}</span>
            <span className="item-qty">
              {shipment.cells && shipment.cells.reduce((sum, cell) => 
                sum + (Number(cell.qty) || 0), 0
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
