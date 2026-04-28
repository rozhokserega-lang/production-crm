export function ShipmentBoard({ 
  board, 
  viewMode: _viewMode, 
  hiddenGroups, 
  onToggleGroup, 
  onSelect, 
  selected 
}) {
  if (!board.sections || board.sections.length === 0) {
    return (
      <div className="empty-board">
        <p>Нет данных для отображения</p>
      </div>
    );
  }

  return (
    <div className="shipment-board">
      {board.sections.map(section => {
        const isHidden = hiddenGroups.has(section.name);
        
        return (
          <div key={section.name} className="shipment-section">
            <div 
              className="section-header"
              onClick={() => onToggleGroup(section.name)}
            >
              <h3 className="section-name">{section.name}</h3>
              <span className="toggle-icon">
                {isHidden ? '▶' : '▼'}
              </span>
            </div>
            
            {!isHidden && (
              <div className="section-content">
                {section.items.map(item => (
                  <ShipmentItem
                    key={`${section.name}-${item.item}`}
                    item={item}
                    sectionName={section.name}
                    onSelect={onSelect}
                    isSelected={selected.some(s => 
                      s.item === item.item && s.section === section.name
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ShipmentItem({ item, sectionName, onSelect, isSelected }) {
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
}
