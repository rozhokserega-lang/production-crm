import React from 'react';

// Memoized shipment item component
export const ShipmentItemMemo = React.memo(function ShipmentItem({ 
  item, 
  sectionName, 
  onSelect, 
  isSelected 
}) {
  const handleSelect = () => {
    onSelect({
      ...item,
      section: sectionName,
      id: `${sectionName}-${item.item}`
    });
  };

  return (
    <div 
      className={`shipment-item ${isSelected ? 'selected' : ''}`}
      onClick={handleSelect}
    >
      <div className="item-info">
        <span className="item-name">{item.item}</span>
        {item.material && (
          <span className="item-material">{item.material}</span>
        )}
      </div>
      
      <div className="item-cells">
        {item.cells && item.cells.map(cell => (
          <div key={cell.week} className="cell">
            <span className="week">{cell.week}</span>
            <span className="qty">{cell.qty}</span>
            {cell.bg && (
              <div 
                className="color-indicator"
                style={{ backgroundColor: cell.bg }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if selection state or item data changed
  return (
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.item === nextProps.item &&
    prevProps.sectionName === nextProps.sectionName
  );
});
