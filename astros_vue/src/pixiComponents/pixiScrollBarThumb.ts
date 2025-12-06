import { Graphics } from "pixi.js";

export class PixiScrollBarThumb extends Graphics {

    private thumbWidth: number;
    private thumbHeight: number;
    private dragging: boolean = false;
    private onDragStart: () => void;
    private thumbFillColor: number;
    private thumbFocusColor: number;

    constructor(
        thumbWidth: number,
        thumbHeight: number,
        initialXOffset: number,
        initialYOffset: number,
        onDragStart: () => void,
        thumbFillColor: number,
        thumbFocusColor: number,
    ) {
        super();

        this.thumbWidth = thumbWidth;
        this.thumbHeight = thumbHeight;
        this.onDragStart = onDragStart;
        this.thumbFillColor = thumbFillColor;
        this.thumbFocusColor = thumbFocusColor;

        this.rect(0, 0, this.thumbWidth, this.thumbHeight)
            .fill(this.thumbFillColor);

        this.x = initialXOffset;
        this.y = initialYOffset;
        this.eventMode = 'static';
        this.cursor = 'pointer';

        // Add hover effect
        this.on('pointerover', () => {
            const currentX = this.x;
            const currentY = this.y;
            this.clear()
                .rect(0, 0, this.thumbWidth, this.thumbHeight)
                .fill(this.thumbFocusColor);
            this.x = currentX;
            this.y = currentY;
        });

        // Remove hover effect
        this.on('pointerout', () => {
            const currentX = this.x;
            const currentY = this.y;
            this.clear()
                .rect(0, 0, this.thumbWidth, this.thumbHeight)
                .fill(this.thumbFillColor);
            this.x = currentX;
            this.y = currentY;
        });

        this.on('pointerdown', () => {
            this.dragging = true;
            this.onDragStart();
        });
    }

    public resizeY(newThumbHeight: number, newY: number) {
        this.thumbHeight = newThumbHeight;
        const currentX = this.x;
        this.clear()
            .rect(0, 0, this.thumbWidth, this.thumbHeight)
            .fill(this.thumbFillColor);
        this.x = currentX;
        this.y = newY;
    }

    public resizeX(newThumbWidth: number, newX: number) {
        this.thumbWidth = newThumbWidth;
        const currentY = this.y;
        this.clear()
            .rect(0, 0, this.thumbWidth, this.thumbHeight)
            .fill(this.thumbFillColor);
        this.x = newX;
        this.y = currentY;
    }

    setDragging(isDragging: boolean) {
        this.dragging = isDragging;
    }

    isDragging(): boolean {
        return this.dragging;
    }

    dragY(newY: number) {
        if (this.dragging) {
            this.y = newY;
        }
    }

    dragX(newX: number) {
        if (this.dragging) {
            this.x = newX;
        }
    }

    endDrag() {
        if (this.dragging) {
            this.dragging = false;
            const currentX = this.x;
            const currentY = this.y;
            this.clear()
                .rect(0, 0, this.thumbWidth, this.thumbHeight)
                .fill(this.thumbFillColor);
            this.x = currentX;
            this.y = currentY;
        }
    }
}