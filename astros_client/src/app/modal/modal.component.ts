import { Component, ElementRef, Input, OnInit, Renderer2, OnDestroy } from '@angular/core';
import { ModalService } from './modal.service';

@Component({
    selector: 'astros-modal',
    templateUrl: './modal.component.html',
    styleUrls: ['./modal.component.scss'],
    standalone: true
})
export class ModalComponent implements OnInit, OnDestroy {

  @Input() id: string;
  @Input() disableBackgroundClick: string;

  private element: ElementRef;

  constructor(private renderer: Renderer2, private modalService: ModalService, private el: ElementRef) {
    this.id = '';
    this.disableBackgroundClick = '';
    this.element = el;
  }

  ngOnInit(): void {

    if (!this.id || this.id === '') {
      console.error('modal must have an id');
      return;
    }

    this.renderer.appendChild(document.body, this.element.nativeElement);

    this.element.nativeElement.addEventListener('click', (el: any) => {
      if (el.target.className === 'astros-modal-background' && !+this.disableBackgroundClick) {
        this.close();
      }
    });

    this.modalService.add(this);
  }

  ngOnDestroy(): void {
    this.modalService.remove(this.id);
    this.element.nativeElement.remove();
  }

  open(): void {
    this.element.nativeElement.style.display = 'block';
    document.body.classList.add('astros-modal-open');
  }

  close(): void {
    this.element.nativeElement.style.display = 'none';
    document.body.classList.remove('astro-modal-open');
  }
}
