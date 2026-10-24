import { forwardRef } from 'react';
import Checkbox from './Checkbox';

const Radio = forwardRef(function Radio(props, ref) {
  return <Checkbox ref={ref} type="radio" {...props} />;
});

export default Radio;
