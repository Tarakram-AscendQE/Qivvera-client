"""Independent synthetic expense application. Local-only; no real reimbursements.
Its deliberately faulty modes test the adapter/oracle. No target verdict is supplied.
"""
import argparse, hashlib, json, os, sqlite3, uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--database', required=True)
    parser.add_argument('--mode', choices=['correct','self-approval-defect','repeat-approval-defect','reject-all'], default='correct')
    args=parser.parse_args()
    maker, checker=os.environ.get('FIXTURE_MAKER_TOKEN'),os.environ.get('FIXTURE_CHECKER_TOKEN')
    if not maker or not checker or maker==checker: raise ValueError('Distinct explicit test credentials required')
    db=sqlite3.connect(args.database)
    db.execute('CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,employee TEXT,authorized_by TEXT,state TEXT,trace TEXT UNIQUE)')
    artifact='sha256:'+hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    revision=os.environ.get('FIXTURE_SOURCE_REVISION','a'*40)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def send(self,status,body):
            payload=json.dumps(body).encode()
            self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
        def subject(self):
            value=self.headers.get('Authorization')
            return 'maker' if value=='Bearer '+maker else 'checker' if value=='Bearer '+checker else None
        def record(self,row):
            return dict(expenseId=row[0],employee=row[1],authorizedBy=row[2],state=row[3],trace=row[4])
        def do_GET(self):
            subject=self.subject()
            if not subject:return self.send(401,{'code':'UNAUTHENTICATED'})
            if self.path=='/meta':return self.send(200,dict(contract='qivvera.expense-http/1',revision=revision,artifact=artifact,environment='sha256:'+'e'*64,instance='expense-instance'))
            if self.path=='/principal':return self.send(200,{'principal':subject})
            parts=self.path.split('/')
            if len(parts)==3 and parts[1]=='expenses':
                row=db.execute('SELECT * FROM expenses WHERE id=?',(parts[2],)).fetchone()
                return self.send(200,self.record(row)) if row else self.send(404,{'code':'NOT_FOUND'})
            self.send(404,{'code':'NOT_FOUND'})
        def do_POST(self):
            subject=self.subject()
            if not subject:return self.send(401,{'code':'UNAUTHENTICATED'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if length<0 or length>4096:return self.send(413,{'code':'TOO_LARGE'})
                data=json.loads(self.rfile.read(length) or '{}')
                if not isinstance(data,dict):raise ValueError()
            except (ValueError,TypeError):return self.send(400,{'code':'INVALID_JSON'})
            if self.path=='/expenses':
                if subject!='maker' or not isinstance(data.get('trace'),str) or data.get('amountMinor')!=100 or data.get('currency')!='INR':return self.send(400,{'code':'INVALID_EXPENSE'})
                row=(str(uuid.uuid4()),subject,None,'SUBMITTED',data['trace'])
                try:db.execute('INSERT INTO expenses VALUES(?,?,?,?,?)',row);db.commit()
                except sqlite3.IntegrityError:return self.send(409,{'code':'TRACE_EXISTS'})
                return self.send(201,self.record(row))
            parts=self.path.split('/')
            if len(parts)==4 and parts[1]=='expenses' and parts[3]=='authorize':
                row=db.execute('SELECT * FROM expenses WHERE id=?',(parts[2],)).fetchone()
                if not row:return self.send(404,{'code':'NOT_FOUND'})
                if row[3]!='SUBMITTED' and args.mode!='repeat-approval-defect':return self.send(409,{'code':'ALREADY_FINALIZED'})
                if args.mode=='reject-all' or subject==row[1] and args.mode!='self-approval-defect':return self.send(403,{'code':'SAME_ACTOR'})
                db.execute('UPDATE expenses SET state=?,authorized_by=? WHERE id=?',('APPROVED',subject,row[0]));db.commit()
                return self.send(200,self.record(db.execute('SELECT * FROM expenses WHERE id=?',(row[0],)).fetchone()))
            self.send(404,{'code':'NOT_FOUND'})
    server=HTTPServer(('127.0.0.1',args.port),Handler)
    print(json.dumps({'port':server.server_port,'artifactDigest':artifact}),flush=True)
    try:server.serve_forever()
    finally:server.server_close();db.close()
if __name__=='__main__':main()
