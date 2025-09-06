export interface Queue {
  enqueue(name:string, payload:any): Promise<void>;
}