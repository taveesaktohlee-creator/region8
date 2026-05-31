import Swal, { type SweetAlertIcon } from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

const baseCustomClass = {
  popup: 'rounded-3xl px-6 py-5 font-sarabun',
  title: 'text-left text-2xl font-black text-slate-900',
  htmlContainer: 'text-left text-base font-semibold text-slate-600',
  actions: 'gap-3',
  confirmButton: 'rounded-2xl bg-blue-600 px-8 py-3 text-base font-black text-white shadow-none hover:bg-blue-700',
  cancelButton: 'rounded-2xl bg-blue-100 px-8 py-3 text-base font-black text-blue-900 shadow-none hover:bg-blue-200',
};

const fastDialogOptions = {
  animation: false,
  heightAuto: false,
  buttonsStyling: false,
  showClass: { popup: '' },
  hideClass: { popup: '' },
  customClass: baseCustomClass,
};

type ConfirmOptions = {
  title?: string;
  text: string;
  icon?: SweetAlertIcon;
  confirmButtonText?: string;
  cancelButtonText?: string;
};

type AlertOptions = {
  title?: string;
  text: string;
  icon?: SweetAlertIcon;
  confirmButtonText?: string;
};

export async function confirmDialog({
  title = 'ยืนยันการดำเนินการ',
  text,
  icon = 'warning',
  confirmButtonText = 'ตกลง',
  cancelButtonText = 'ยกเลิก',
}: ConfirmOptions) {
  const result = await Swal.fire({
    ...fastDialogOptions,
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
    focusCancel: true,
  });

  return result.isConfirmed;
}

export async function alertDialog({
  title = 'แจ้งเตือน',
  text,
  icon = 'info',
  confirmButtonText = 'ตกลง',
}: AlertOptions) {
  await Swal.fire({
    ...fastDialogOptions,
    title,
    text,
    icon,
    confirmButtonText,
  });
}
