export const homeFor = (role) => (role === 'ADMIN' ? '/admin' : role === 'LAWYER' ? '/lawyer' : '/cases');
