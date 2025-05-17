import React from 'react';
import ak47 from '../assets/img/AK74.png';
import m4a1s from '../assets/img/m4a1-s.png';
import m4a4 from '../assets/img/m4a4.png';
import famas from '../assets/img/famas.png';
import galilar from '../assets/img/galil-ar.png';
import sg553 from '../assets/img/ssg-53.png';
import aug from '../assets/img/aug.png';
import ump45 from '../assets/img/ump-45.png';
import glock18 from '../assets/img/glock18.png';
import usps from '../assets/img/usp-s.png';
import p250 from '../assets/img/p250.png';
import cz75auto from '../assets/img/cz75-auto.png';
import deagle from '../assets/img/desert-eagle.png';
import FiveSeven from '../assets/img/Five-Seven.png';
import SG008 from '../assets/img/SG-008.png';
import awp from '../assets/img/awp.png';
const WeaponSelectionPanel = ({ onSelectWeapon, disabled }) => {
  const weapons = [
    { id: 'ak-47', name: 'AK-47', image: ak47 },
    { id: 'm4a1-s', name: 'M4A1-S', image: m4a1s },
    { id: 'm4a4', name: 'M4A4', image: m4a4 },
    { id: 'famas', name: 'FAMAS', image: famas },
    { id: 'galil-ar', name: 'Galil AR', image: galilar },
    { id: 'sg-553', name: 'SG 553', image: sg553 },
    { id: 'aug', name: 'AUG', image: aug },
    { id: 'ump-45', name: 'UMP-45', image: ump45 },
    { id: 'glock-18', name: 'Glock-18', image: glock18 },
    { id: 'usp-s', name: 'USP-S', image: usps },
    { id: 'p250', name: 'P250', image: p250 },
    { id: 'cz75-auto', name: 'CZ75-Auto', image: cz75auto },
    { id: 'desert-eagle', name: 'Desert Eagle', image: deagle },
    { id: 'FiveSeven', name:'Five seveN', image: FiveSeven},
    { id: 'SG008', name: 'SG-008', image: SG008},
    { id: 'AWP', name: 'AWP', image: awp}
  ];

  const handleClick = (weaponId) => {
    if (!disabled) {
      console.log('Selecting weapon:', weaponId);
      onSelectWeapon(weaponId);
    }
  };

  return (
    <div className="weapon-selection-panel">
      <h5>Chọn súng để thêm vào danh sách ban/pick</h5>
      <div className="weapon-list">
        {weapons.map((weapon) => (
          <div
            key={weapon.id}
            className="weapon-item"
            onClick={() => handleClick(weapon.id)}
            style={{
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <div className="weapon-info">
              <img
                src={weapon.image}
                alt={weapon.name}
                className="weapon-image"
                onError={(e) => (e.target.src = 'https://via.placeholder.com/50?text=Error')}
              />
              <span>{weapon.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeaponSelectionPanel;