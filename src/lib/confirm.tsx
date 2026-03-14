import toast from 'react-hot-toast';

export const confirmAction = (message: string, onConfirm: () => void) => {
  toast((t) => (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-slate-800">{message}</p>
      <div className="flex justify-end gap-2">
        <button 
          onClick={() => toast.dismiss(t.id)} 
          className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button 
          onClick={() => { 
            toast.dismiss(t.id); 
            onConfirm(); 
          }} 
          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
        >
          Confirm
        </button>
      </div>
    </div>
  ), { 
    duration: Infinity,
    position: 'top-center',
    style: {
      minWidth: '300px',
    }
  });
};
