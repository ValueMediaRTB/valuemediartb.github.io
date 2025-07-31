
import React, { useState } from 'react';

const GroupCreator = ({ onCreate, onClose }) => {
  const [selectedOption1, setSelectedOption1] = useState('');
  const [selectedOption2, setSelectedOption2] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreate({
      name: groupName,
      options: [selectedOption1, selectedOption2]
    });
    setGroupName(selectedOption1+'_'+selectedOption2);
    setSelectedOption1('');
    setSelectedOption2('');
    onClose();
  };

  return (
    <div className="group-creator-modal">
      <div className="group-creator-content">
        <button className="close-button" onClick={onClose}>×</button>
        <h3>Create New Group</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Group Name:</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label>First Filter:</label>
            <select
              value={selectedOption1}
              onChange={(e) => setSelectedOption1(e.target.value)}
              required
            >
              <option value="">Select...</option>
              <option value="traffic_source">Traffic Source</option>
              <option value="campaign">Campaign</option>
              <option value="country">Country</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Second Filter:</label>
            <select
              value={selectedOption2}
              onChange={(e) => setSelectedOption2(e.target.value)}
            >
              <option value="">Select...</option>
              <option value="clicks">Clicks</option>
              <option value="conversions">Conversions</option>
              <option value="profit">Profit</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Third Filter:</label>
            <select
              value={selectedOption3}
              onChange={(e) => setSelectedOption3(e.target.value)}
            >
              <option value="">Select...</option>
              <option value="epc">EPC</option>
              <option value="cpc">CPC</option>
              <option value="cr">CR</option>
            </select>
          </div>
          
          <button type="submit">Create Group</button>
        </form>
      </div>
    </div>
  );
};

export default GroupCreator;
