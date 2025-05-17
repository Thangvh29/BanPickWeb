import React, { useState } from 'react';
import { Row, Col, Alert } from 'react-bootstrap';
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
import awp from 
import '../index.css';

const WeaponGrid = ({ currentTurn, onUpdate, turnAction, user, availableWeapons, onBanPick, bans, picks }) => {
  const [error, setError] = useState('');
  const [selectedWeapon, setSelectedWeapon] = useState(null);

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
  ];

  const filteredWeapons = weapons.filter(weapon => availableWeapons.includes(weapon.id));

  const isPlayerTurn = (user === 'player1' && currentTurn === 'team1') || (user === 'player2' && currentTurn === 'team2');

  const getWeaponState = (weaponId) => {
    if (bans?.some(ban => ban.weaponId === weaponId)) return 'banned';
    if (picks?.some(pick => pick.weaponId === weaponId)) return 'picked';
    return null;
  };

  const handleWeaponClick = (weaponId) => {
    if (!turnAction || !currentTurn) {
      setError('Chưa bắt đầu ban/pick!');
      return;
    }
    if (!isPlayerTurn) {
      setError('Không phải lượt của bạn!');
      return;
    }
    const state = getWeaponState(weaponId);
    if (state) {
      setError('Súng này đã được ban hoặc pick!');
      return;
    }
    setError('');
    setSelectedWeapon(weaponId);
  };

  const handleLockIn = (weaponId) => {
    if (!isPlayerTurn) {
      setError('Không phải lượt của bạn!');
      return;
    }
    if (!weaponId) {
      setError('Vui lòng chọn một súng!');
      return;
    }
    setError('');
    console.log(`User ${user} locking ${turnAction} on ${weaponId}`);
    onBanPick(weaponId, turnAction);
    setSelectedWeapon(null);
    onUpdate();
  };

  return (
    <div className="weapon-grid">
      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}
      <h4>Danh sách súng</h4>
      <Row>
        {filteredWeapons.map((weapon) => {
          const state = getWeaponState(weapon.id);
          const isSelected = selectedWeapon === weapon.id;

          return (
            <Col key={weapon.id} xs={4} className="mb-2">
              <div
                className={`weapon-item ${state || ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => !state && handleWeaponClick(weapon.id)}
                style={{
                  cursor: !state && isPlayerTurn && turnAction ? 'pointer' : 'not-allowed',
                  opacity: state ? 0.7 : 1,
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
                {isSelected && isPlayerTurn && turnAction && (
                  <button
                    className="btn-lock"
                    onClick={() => handleLockIn(weapon.id)}
                  >
                    Khóa chọn
                  </button>
                )}
              </div>
            </Col>
          );
        })}
      </Row>
    </div>
  );
};

export default WeaponGrid;