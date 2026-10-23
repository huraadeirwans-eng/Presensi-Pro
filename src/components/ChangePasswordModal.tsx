import React from 'react';
import { ForgotPasswordModal, ForgotPasswordModalProps } from './ForgotPasswordModal';

export type ChangePasswordModalProps = ForgotPasswordModalProps;

/**
 * Fasilitas Lupa Password Administrator Modal
 * (Menggantikan fasilitas ubah kata sandi sebelumnya agar pengguna yang lupa password lama dapat mereset dengan mudah)
 */
export const ChangePasswordModal: React.FC<ForgotPasswordModalProps> = (props) => {
  return <ForgotPasswordModal {...props} />;
};

export default ChangePasswordModal;
