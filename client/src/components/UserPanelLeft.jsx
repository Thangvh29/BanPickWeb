import React from 'react';
import { Card } from 'react-bootstrap';

const UserPanelLeft = ({ label, bans, picks, bannedWeapons, pickedWeapons, isCurrentTurn }) => {
  return (
    <Card className="user-panel" style={{ backgroundColor: isCurrentTurn ? '#d1e7dd' : '#f8f9fa' }}>
      <Card.Body>
        <h5>{label}</h5>
        <p>Số lượt ban: {bans}</p>
        <p>Số lượt pick: {picks}</p>
        <div>
          <strong>Banned:</strong>
          <ul>
            {bannedWeapons.map((ban, index) => (
              <li key={index}>{ban.weaponId}</li>
            ))}
          </ul>
        </div>
        <div>
          <strong>Picked:</strong>
          <ul>
            {pickedWeapons.map((pick, index) => (
              <li key={index}>{pick.weaponId}</li>
            ))}
          </ul>
        </div>
      </Card.Body>
    </Card>
  );
};

export default UserPanelLeft;