import {locateText} from './label-vision.mjs?aim=3';
self.onmessage=e=>{const frame=e.data,start=performance.now(),regions=locateText(frame.gray,frame.w,frame.h);self.postMessage({...frame,regions,durationMs:performance.now()-start},[frame.gray.buffer]);};
