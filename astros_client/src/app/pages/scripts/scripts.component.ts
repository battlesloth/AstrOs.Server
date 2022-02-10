import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { faTrash, faUpload } from '@fortawesome/free-solid-svg-icons';
import { Script } from 'astros-common';
import { ScriptsService } from 'src/app/services/scripts/scripts.service';

@Component({
  selector: 'app-scripts',
  templateUrl: './scripts.component.html',
  styleUrls: ['./scripts.component.scss']
})
export class ScriptsComponent implements OnInit {

  faTrash = faTrash;
  faUpload = faUpload;

  scripts: Array<Script>

  constructor(private router: Router, private scriptService: ScriptsService) { 
    this.scripts = new Array<Script>();
  }

  ngOnInit(): void {
    const observer = {
      next: (result: Script[]) => this.scripts = result,
      error: (err: any) => console.error(err)
    };

    this.scriptService.getAllScripts().subscribe(observer);
  }

  newScript(){
    this.router.navigate(['scripter', '0']);
  }

  removeClicked(){

  }

  uploadClicked(id: string){
    const observer = {
      next: (result: any) => console.log(result),
      error: (err: any) => console.error(err)
    };
    
    this.scriptService.uploadScript(id).subscribe();
  }

}
